import { Alert, Button, Card, Form, Input, Spin, Typography } from "antd";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../../config/runtime-config";
import {
  ADMIN_SESSION_INVALID_EVENT,
  fetchAdminJson
} from "./admin-api";

type SessionPayload = {
  enabled: boolean;
  authenticated: boolean;
  username?: string | null;
  authSource?: string | null;
};

type AdminSessionContextValue = SessionPayload & {
  loading: boolean;
  refreshSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionPayload>({
    enabled: false,
    authenticated: false,
    username: null,
    authSource: null
  });

  useEffect(() => {
    void refreshSession();

    function handleUnauthorized() {
      void refreshSession();
    }

    window.addEventListener(ADMIN_SESSION_INVALID_EVENT, handleUnauthorized);

    return () => {
      window.removeEventListener(ADMIN_SESSION_INVALID_EVENT, handleUnauthorized);
    };
  }, []);

  async function refreshSession() {
    try {
      setLoading(true);

      const response = await fetch(`${getApiBaseUrl()}/admin/session`, {
        credentials: "include"
      });
      const json = (await response.json()) as {
        data: SessionPayload;
      };

      setSession(
        json.data ?? {
          enabled: false,
          authenticated: false,
          username: null,
          authSource: null
        }
      );
    } catch {
      setSession({
        enabled: false,
        authenticated: false,
        username: null,
        authSource: null
      });
    } finally {
      setLoading(false);
    }
  }

  async function login(username: string, password: string) {
    const nextSession = await fetchAdminJson<SessionPayload>("/admin/session/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    setSession(nextSession);
  }

  async function logout() {
    const nextSession = await fetchAdminJson<SessionPayload>("/admin/session/logout", {
      method: "POST"
    });

    setSession(nextSession);
  }

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      ...session,
      loading,
      refreshSession,
      login,
      logout
    }),
    [loading, session]
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {props.children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  const context = useContext(AdminSessionContext);

  if (!context) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }

  return context;
}

export function RequireAdminSession(props: { children: React.ReactNode }) {
  const session = useAdminSession();

  if (session.loading) {
    return (
      <div className="admin-login-shell">
        <div className="admin-login-loading">
          <Spin size="large" />
          <Typography.Text type="secondary">
            正在检查管理员会话
          </Typography.Text>
        </div>
      </div>
    );
  }

  if (!session.authenticated) {
    return <AdminLoginPage />;
  }

  return <>{props.children}</>;
}

function AdminLoginPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<{ username: string; password: string }>();
  const { login } = useAdminSession();

  async function handleSubmit() {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      setError(null);
      await login(values.username, values.password);
    } catch (caught) {
      if (
        typeof caught === "object" &&
        caught !== null &&
        "errorFields" in caught
      ) {
        return;
      }

      setError(caught instanceof Error ? caught.message : "管理员登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <Card className="admin-login-card" bordered={false}>
        <Typography.Text className="admin-login-eyebrow">
          OPENCASHIER ADMIN
        </Typography.Text>
        <Typography.Title level={2} style={{ marginTop: 12, marginBottom: 8 }}>
          管理后台登录
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          托管收银台和商户 API 对外开放，后台配置与商户应用管理需要管理员认证。
        </Typography.Paragraph>
        {error ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="登录失败"
            description={error}
          />
        ) : null}
        <Form form={form} layout="vertical" size="large">
          <Form.Item
            name="username"
            label="管理员账号"
            rules={[{ required: true, message: "请输入管理员账号" }]}
          >
            <Input autoComplete="username" placeholder="请输入管理员账号" />
          </Form.Item>
          <Form.Item
            name="password"
            label="管理员密码"
            rules={[{ required: true, message: "请输入管理员密码" }]}
          >
            <Input.Password
              autoComplete="current-password"
              placeholder="请输入管理员密码"
            />
          </Form.Item>
          <Button
            type="primary"
            block
            loading={submitting}
            onClick={() => void handleSubmit()}
          >
            登录后台
          </Button>
        </Form>
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 16, marginBottom: 0 }}
        >
          如果你需要用脚本调用管理员 API，也可以直接使用 HTTP Basic Auth。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
