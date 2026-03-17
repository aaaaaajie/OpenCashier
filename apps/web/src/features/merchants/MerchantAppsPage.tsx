import {
  ApiOutlined,
  LinkOutlined,
  PlusOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type TableColumnsType
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminJson } from "../admin/admin-api";

type MerchantAppRecord = {
  appId: string;
  appName: string;
  merchantName: string;
  status: string;
  signType: string;
  allowedChannels: string[];
  hasSecretConfigured: boolean;
  createdAt: string;
};

type OnboardingPreset = {
  key: string;
  label: string;
  description: string;
  channels: string[];
};

type ChannelGuide = {
  channel: string;
  label: string;
  providerCode: string;
  providerName: string;
  recommendedFor: string;
  description: string;
};

type OnboardingFaq = {
  question: string;
  answer: string;
};

type OnboardingData = {
  adminAuthEnabled: boolean;
  merchantApiBaseUrl: string;
  swaggerUrl: string;
  hostedCashierEntryUrl: string;
  createMerchantAppApiPath: string;
  idempotencyKeySuggestions: {
    createOrder: string;
    closeOrder: string;
    createRefund: string;
  };
  channelPresets: OnboardingPreset[];
  channelGuides: ChannelGuide[];
  newbieFaq: OnboardingFaq[];
};

type CreateMerchantAppValues = {
  merchantName: string;
  appName: string;
  allowedChannels: string[];
};

type CreatedMerchantApp = {
  merchantName: string;
  appName: string;
  appId: string;
  appSecret: string;
  status: string;
  signType: string;
  allowedChannels: string[];
  merchantApiBaseUrl: string;
  swaggerUrl: string;
};

type StatusMeta = {
  color: string;
  label: string;
};

type SignTypeMeta = {
  label: string;
  description: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function resolveStatusMeta(status: string): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return {
        color: "green",
        label: "已生效"
      };
    case "DISABLED":
      return {
        color: "default",
        label: "已停用"
      };
    default:
      return {
        color: "blue",
        label: status
      };
  }
}

function resolveSignTypeMeta(signType: string): SignTypeMeta {
  switch (signType) {
    case "RSA2":
      return {
        label: "证书模式",
        description: "RSA2 / 证书签名"
      };
    case "HMAC-SHA256":
    default:
      return {
        label: "签名密钥",
        description: "HMAC-SHA256"
      };
  }
}

export function MerchantAppsPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<MerchantAppRecord[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [createdApp, setCreatedApp] = useState<CreatedMerchantApp | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm<CreateMerchantAppValues>();

  const channelGuideMap = useMemo(
    () =>
      new Map(
        (onboarding?.channelGuides ?? []).map((guide) => [guide.channel, guide])
      ),
    [onboarding]
  );

  const activeAppsCount = useMemo(
    () => apps.filter((item) => item.status === "ACTIVE").length,
    [apps]
  );

  const configuredSecretCount = useMemo(
    () => apps.filter((item) => item.hasSecretConfigured).length,
    [apps]
  );

  const availableChannelCount = onboarding?.channelGuides.length ?? 0;

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [merchantApps, onboardingInfo] = await Promise.all([
        fetchAdminJson<MerchantAppRecord[]>("/admin/merchants"),
        fetchAdminJson<OnboardingData>("/admin/merchants/onboarding")
      ]);

      setApps(merchantApps);
      setOnboarding(onboardingInfo);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load merchant apps"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  function openCreateModal() {
    form.resetFields();
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (saving) {
      return;
    }

    setCreateModalOpen(false);
    form.resetFields();
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      messageApi.success(`${label} 已复制`);
    } catch {
      messageApi.error(`${label} 复制失败，请手动复制`);
    }
  }

  async function handleCreateMerchantApp() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const created = await fetchAdminJson<CreatedMerchantApp>("/admin/merchants", {
        method: "POST",
        body: JSON.stringify(values)
      });

      setCreatedApp(created);
      setCreateModalOpen(false);
      form.resetFields();
      messageApi.success("商户应用已创建，一次性密钥已生成");
      await loadPage();
    } catch (caught) {
      if (
        typeof caught === "object" &&
        caught !== null &&
        "errorFields" in caught
      ) {
        return;
      }

      messageApi.error(
        caught instanceof Error ? caught.message : "创建商户应用失败"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyCreatedCredentials() {
    if (!createdApp) {
      return;
    }

    await copyText(
      [
        `App ID: ${createdApp.appId}`,
        `App Secret: ${createdApp.appSecret}`,
        `Merchant API: ${createdApp.merchantApiBaseUrl}`
      ].join("\n"),
      "应用凭据"
    );
  }

  const columns = useMemo<TableColumnsType<MerchantAppRecord>>(
    () => [
      {
        title: "商户 / 应用",
        dataIndex: "appName",
        width: 240,
        render: (_value: string, record) => (
          <div className="merchant-apps-name-cell">
            <Typography.Text strong>{record.appName}</Typography.Text>
            <Typography.Text type="secondary">{record.merchantName}</Typography.Text>
          </div>
        )
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 120,
        render: (value: string) => {
          const meta = resolveStatusMeta(value);

          return <Tag color={meta.color}>{meta.label}</Tag>;
        }
      },
      {
        title: "App ID",
        dataIndex: "appId",
        width: 220,
        render: (value: string) => (
          <Typography.Text code copyable={{ text: value }}>
            {value}
          </Typography.Text>
        )
      },
      {
        title: "接入方式",
        dataIndex: "signType",
        width: 150,
        render: (value: string) => {
          const meta = resolveSignTypeMeta(value);

          return (
            <div className="merchant-apps-access-cell">
              <Typography.Text strong>{meta.label}</Typography.Text>
              <Typography.Text type="secondary">{meta.description}</Typography.Text>
            </div>
          );
        }
      },
      {
        title: "默认支付范围",
        dataIndex: "allowedChannels",
        render: (value: string[]) => (
          <div className="merchant-apps-channel-cell">
            {value.map((channel) => {
              const guide = channelGuideMap.get(channel);

              return (
                <Tag key={channel}>
                  {guide?.label ?? channel}
                </Tag>
              );
            })}
          </div>
        )
      },
      {
        title: "创建时间",
        dataIndex: "createdAt",
        width: 180,
        render: (value: string) => formatDateTime(value)
      },
      {
        title: "操作",
        key: "actions",
        width: 160,
        render: (_value: unknown, record) => (
          <Space size={4} wrap>
            <Button
              type="link"
              onClick={() => void copyText(record.appId, "App ID")}
            >
              复制 ID
            </Button>
            {onboarding?.merchantApiBaseUrl ? (
              <Button
                type="link"
                onClick={() =>
                  void copyText(onboarding.merchantApiBaseUrl, "Merchant API 根地址")
                }
              >
                复制 API
              </Button>
            ) : null}
          </Space>
        )
      }
    ],
    [channelGuideMap, messageApi, onboarding?.merchantApiBaseUrl]
  );

  return (
    <>
      {contextHolder}
      <div className="merchant-apps-shell">
        {error ? (
          <Alert
            type="error"
            showIcon
            message="商户应用加载失败"
            description={error}
          />
        ) : null}

        <section className="merchant-apps-board">
          <div className="merchant-apps-board-header">
            <div>
              <Typography.Title level={3} className="merchant-apps-title">
                商户应用配置
              </Typography.Title>
            </div>
            <Space className="merchant-apps-board-actions" wrap>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={openCreateModal}
                disabled={loading || !onboarding}
              >
                新建应用
              </Button>
            </Space>
          </div>

          <div className="merchant-apps-board-body">
            <div className="merchant-apps-summary-grid">
              <div className="merchant-apps-summary-card">
                <Typography.Text className="merchant-apps-summary-label">
                  商户应用数
                </Typography.Text>
                <Typography.Text className="merchant-apps-summary-value">
                  {loading ? "--" : apps.length}
                </Typography.Text>
              </div>
              <div className="merchant-apps-summary-card">
                <Typography.Text className="merchant-apps-summary-label">
                  已生效应用
                </Typography.Text>
                <Typography.Text className="merchant-apps-summary-value">
                  {loading ? "--" : activeAppsCount}
                </Typography.Text>
              </div>
              <div className="merchant-apps-summary-card">
                <Typography.Text className="merchant-apps-summary-label">
                  已配置密钥
                </Typography.Text>
                <Typography.Text className="merchant-apps-summary-value">
                  {loading ? "--" : configuredSecretCount}
                </Typography.Text>
              </div>
              <div className="merchant-apps-summary-card">
                <Typography.Text className="merchant-apps-summary-label">
                  可选渠道
                </Typography.Text>
                <Typography.Text className="merchant-apps-summary-value">
                  {loading ? "--" : availableChannelCount}
                </Typography.Text>
              </div>
            </div>

            <div className="merchant-apps-table-wrap">
              <Table
                className="merchant-apps-table"
                rowKey="appId"
                dataSource={apps}
                columns={columns}
                loading={loading}
                pagination={false}
                scroll={{ x: 1080 }}
                locale={{
                  emptyText: "还没有商户应用，点击右上角“新建应用”开始创建。"
                }}
              />
            </div>
          </div>
        </section>

        <Card
          className="page-card merchant-apps-info-card"
          title="接入地址"
          extra={<ApiOutlined />}
        >
          <div className="merchant-apps-endpoint-list">
            <div className="merchant-apps-endpoint-item">
              <Typography.Text className="merchant-apps-endpoint-label">
                Merchant API 根地址
              </Typography.Text>
              {onboarding?.merchantApiBaseUrl ? (
                <Typography.Text
                  code
                  copyable={{ text: onboarding.merchantApiBaseUrl }}
                >
                  {onboarding.merchantApiBaseUrl}
                </Typography.Text>
              ) : (
                "-"
              )}
            </div>
            <div className="merchant-apps-endpoint-item">
              <Typography.Text className="merchant-apps-endpoint-label">
                Swagger
              </Typography.Text>
              {onboarding?.swaggerUrl ? (
                <Typography.Text code copyable={{ text: onboarding.swaggerUrl }}>
                  {onboarding.swaggerUrl}
                </Typography.Text>
              ) : (
                "-"
              )}
            </div>
            <div className="merchant-apps-endpoint-item">
              <Typography.Text className="merchant-apps-endpoint-label">
                托管收银台入口
              </Typography.Text>
              {onboarding?.hostedCashierEntryUrl ? (
                <Typography.Text
                  code
                  copyable={{ text: onboarding.hostedCashierEntryUrl }}
                >
                  {onboarding.hostedCashierEntryUrl}
                </Typography.Text>
              ) : (
                "-"
              )}
            </div>
            <div className="merchant-apps-endpoint-item">
              <Typography.Text className="merchant-apps-endpoint-label">
                管理员创建应用 API
              </Typography.Text>
              {onboarding?.merchantApiBaseUrl &&
              onboarding?.createMerchantAppApiPath ? (
                <Typography.Text
                  code
                  copyable={{
                    text: `${onboarding.merchantApiBaseUrl.replace(
                      /\/api\/v1$/,
                      ""
                    )}${onboarding.createMerchantAppApiPath}`
                  }}
                >
                  POST {onboarding.createMerchantAppApiPath}
                </Typography.Text>
              ) : (
                "-"
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={isCreateModalOpen}
        width={760}
        wrapClassName="merchant-apps-modal"
        title="新建商户应用"
        okText="创建应用"
        cancelText="取消"
        confirmLoading={saving}
        styles={{
          content: {
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          },
          body: {
            overflowY: "auto",
            paddingTop: 12
          }
        }}
        onOk={() => void handleCreateMerchantApp()}
        onCancel={closeCreateModal}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="merchantName"
            label="商户名称"
            rules={[{ required: true, message: "请输入商户名称" }]}
          >
            <Input placeholder="例如：示例商户" />
          </Form.Item>
          <Form.Item
            name="appName"
            label="应用名称"
            rules={[{ required: true, message: "请输入应用名称" }]}
          >
            <Input placeholder="例如：官网支付应用" />
          </Form.Item>
          <Form.Item
            name="allowedChannels"
            label="支付渠道"
            rules={[
              {
                required: true,
                message: "请至少选择一个支付渠道"
              }
            ]}
          >
            <Select
              mode="multiple"
              placeholder="选择此应用允许使用的支付渠道"
              options={(onboarding?.channelGuides ?? []).map((guide) => ({
                label: `${guide.label} (${guide.channel})`,
                value: guide.channel
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(createdApp)}
        width={720}
        wrapClassName="merchant-apps-modal"
        title="应用已创建，请立即保存密钥"
        styles={{
          content: {
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          },
          body: {
            overflowY: "auto",
            paddingTop: 12
          }
        }}
        onCancel={() => setCreatedApp(null)}
        footer={[
          <Button key="copy" icon={<LinkOutlined />} onClick={() => void handleCopyCreatedCredentials()}>
            复制凭据
          </Button>,
          <Button key="close" type="primary" onClick={() => setCreatedApp(null)}>
            我已保存
          </Button>
        ]}
      >
        {createdApp ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              这是本次创建返回的唯一一次明文凭据。关闭后不会再次展示，请立即保存。
            </Typography.Paragraph>

            <div className="merchant-apps-secret-card">
              <div className="merchant-apps-secret-row">
                <Typography.Text className="merchant-apps-secret-label">
                  商户 / 应用
                </Typography.Text>
                <Typography.Text className="merchant-apps-secret-value">
                  {createdApp.merchantName} / {createdApp.appName}
                </Typography.Text>
              </div>
              <div className="merchant-apps-secret-row">
                <Typography.Text className="merchant-apps-secret-label">
                  App ID
                </Typography.Text>
                <Typography.Text
                  className="merchant-apps-secret-value"
                  code
                  copyable={{ text: createdApp.appId }}
                >
                  {createdApp.appId}
                </Typography.Text>
              </div>
              <div className="merchant-apps-secret-row">
                <Typography.Text className="merchant-apps-secret-label">
                  App Secret
                </Typography.Text>
                <Typography.Text
                  className="merchant-apps-secret-value"
                  code
                  copyable={{ text: createdApp.appSecret }}
                >
                  {createdApp.appSecret}
                </Typography.Text>
              </div>
              <div className="merchant-apps-secret-row">
                <Typography.Text className="merchant-apps-secret-label">
                  Merchant API 根地址
                </Typography.Text>
                <Typography.Text
                  className="merchant-apps-secret-value"
                  code
                  copyable={{ text: createdApp.merchantApiBaseUrl }}
                >
                  {createdApp.merchantApiBaseUrl}
                </Typography.Text>
              </div>
            </div>
          </Space>
        ) : null}
      </Modal>
    </>
  );
}
