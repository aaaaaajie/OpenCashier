import {
  DashboardOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined
} from "@ant-design/icons";
import {
  Button,
  Breadcrumb,
  Layout,
  Menu,
  Space,
  Typography
} from "antd";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAdminSession } from "../features/admin/AdminSessionContext";

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: "/dashboard",
    icon: <DashboardOutlined />,
    label: <Link to="/dashboard">总览</Link>
  },
  {
    key: "/merchants",
    icon: <SafetyCertificateOutlined />,
    label: <Link to="/merchants">商户应用</Link>
  },
  {
    key: "/orders",
    icon: <ShoppingCartOutlined />,
    label: <Link to="/orders">支付订单</Link>
  },
  {
    key: "/refunds",
    icon: <ReloadOutlined />,
    label: <Link to="/refunds">退款单</Link>
  },
  {
    key: "/notifications",
    icon: <NotificationOutlined />,
    label: <Link to="/notifications">通知任务</Link>
  },
  {
    key: "/settings",
    icon: <SettingOutlined />,
    label: <Link to="/settings">系统设置</Link>
  }
];

const breadcrumbTitleMap: Record<string, string> = {
  "/dashboard": "总览",
  "/merchants": "商户应用",
  "/orders": "支付订单",
  "/refunds": "退款单",
  "/notifications": "通知任务",
  "/settings": "系统设置"
};

export function AdminLayout() {
  const location = useLocation();
  const { username, logout } = useAdminSession();

  return (
    <Layout style={{ minHeight: "100vh", height: "100vh" }}>
      <Sider
        className="admin-sider"
        breakpoint="lg"
        collapsedWidth={72}
        width={240}
        style={{
          background: "#0f172a"
        }}
      >
        <div style={{ padding: 20, color: "#fff" }}>
          <Typography.Title
            level={4}
            style={{ color: "#fff", margin: 0, fontSize: 18 }}
          >
            统一收银台
          </Typography.Title>
        </div>
        <Menu
          className="admin-sider-menu"
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
        <div
          className="admin-sider-footer"
          style={{
            padding: 16,
            borderTop: "1px solid rgba(148,163,184,0.16)"
          }}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {username ? (
              <Typography.Text style={{ color: "rgba(255,255,255,0.72)" }}>
                {username}
              </Typography.Text>
            ) : null}
            <Button block onClick={() => void logout()}>
              退出登录
            </Button>
          </Space>
        </div>
      </Sider>
      <Layout style={{ minWidth: 0, minHeight: 0 }}>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(255,255,255,0.8)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(15,23,42,0.08)"
          }}
        >
          <Space direction="vertical" size={0}>
            <Breadcrumb
              items={[
                { title: "统一收银台" },
                {
                  title:
                    breadcrumbTitleMap[location.pathname] ?? "总览"
                }
              ]}
            />
          </Space>
        </Header>
        <Content
          style={{
            flex: 1,
            minHeight: 0,
            padding: 24,
            overflowY: "auto"
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
