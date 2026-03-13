import { useEffect, useMemo, useState } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";

type ProviderCatalogItem = {
  providerCode: string;
  displayName: string;
  integrationMode: string;
  officialSdkPackage?: string;
  enabled: boolean;
};

type PlatformConfigInputType = "TEXT" | "TEXTAREA" | "PASSWORD";

type PlatformConfigItemDefinition = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  inputType: PlatformConfigInputType;
  placeholder?: string;
};

type PlatformConfigGroupDefinition = {
  key: string;
  label: string;
  description: string;
  items: PlatformConfigItemDefinition[];
};

type PlatformConfigRecord = {
  id: string;
  key: string;
  value: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
};

type ProviderConfigItem = PlatformConfigItemDefinition & {
  configured: boolean;
  value?: string;
};

type ProviderConfigRow = {
  groupKey: string;
  displayName: string;
  configured: boolean;
  appIdValue?: string;
  notifyUrl?: string;
  gatewayModeLabel?: string;
  items: ProviderConfigItem[];
};

type ApiEnvelope<T> = {
  message: string;
  data: T;
};

type ProviderModalValues = Record<string, string> & {
  providerGroupKey?: string;
};

const PROVIDER_GROUP_TO_CODE = {
  alipay: "ALIPAY",
  wechatpay: "WECHAT_PAY",
  paypal: "PAYPAL",
  stripe: "STRIPE",
} as const satisfies Record<string, string>;

const PROVIDER_GROUP_APP_ID_KEY = {
  alipay: "ALIPAY_APP_ID",
  wechatpay: "WECHATPAY_APP_ID",
  paypal: "PAYPAL_CLIENT_ID",
} as const satisfies Partial<
  Record<keyof typeof PROVIDER_GROUP_TO_CODE, string>
>;

const PROVIDER_GROUP_NOTIFY_PATH = {
  alipay: "/api/v1/notify/alipay",
} as const satisfies Partial<
  Record<keyof typeof PROVIDER_GROUP_TO_CODE, string>
>;

const ALIPAY_GATEWAY_OPTIONS = [
  {
    label: "沙箱测试",
    value: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  },
  {
    label: "正式生产",
    value: "https://openapi.alipay.com/gateway.do",
  },
];

const DEFAULT_ALIPAY_GATEWAY = ALIPAY_GATEWAY_OPTIONS[0]?.value ?? "";

const PROVIDER_CONFIG_GROUPS: PlatformConfigGroupDefinition[] = [
  {
    key: "alipay",
    label: "支付宝配置",
    description:
      "当前接入的是支付宝公钥模式，支持直接粘贴 PEM，也支持填写服务器本地文件路径。",
    items: [
      {
        key: "ALIPAY_APP_ID",
        label: "应用 ID",
        description: "支付宝开放平台分配的应用唯一标识。",
        secret: false,
        inputType: "TEXT",
      },
      {
        key: "ALIPAY_PRIVATE_KEY",
        label: "应用私钥",
        description: "支持直接粘贴 PEM 内容，或填写服务器可访问的密钥文件路径。",
        secret: true,
        inputType: "TEXTAREA",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
      },
      {
        key: "ALIPAY_PUBLIC_KEY",
        label: "支付宝公钥",
        description: "用于验签支付宝返回结果；支持 PEM 内容或文件路径。",
        secret: false,
        inputType: "TEXTAREA",
      },
      {
        key: "ALIPAY_GATEWAY",
        label: "网关地址",
        description:
          "沙箱和生产地址不同，后台固定提供“沙箱测试”和“正式生产”两个选项。",
        secret: false,
        inputType: "TEXT",
      },
    ],
  },
  {
    key: "wechatpay",
    label: "微信支付配置",
    description: "微信支付当前为 API 直连占位，配置齐全后会自动切换为已配置状态。",
    items: [
      {
        key: "WECHATPAY_APP_ID",
        label: "应用 ID",
        description: "微信开放平台或服务商应用 ID。",
        secret: false,
        inputType: "TEXT",
      },
      {
        key: "WECHATPAY_MCH_ID",
        label: "商户号",
        description: "微信支付分配的商户号。",
        secret: false,
        inputType: "TEXT",
      },
      {
        key: "WECHATPAY_API_V3_KEY",
        label: "API v3 密钥",
        description: "微信支付 API v3 证书解密和签名相关密钥。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
      },
      {
        key: "WECHATPAY_PRIVATE_KEY",
        label: "商户私钥",
        description: "支持直接粘贴 PEM 内容，或填写服务器可访问的密钥文件路径。",
        secret: true,
        inputType: "TEXTAREA",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
      },
    ],
  },
  {
    key: "paypal",
    label: "PayPal 配置",
    description: "配置 Client ID / Secret 后，PayPal 通道会自动进入已配置状态。",
    items: [
      {
        key: "PAYPAL_CLIENT_ID",
        label: "Client ID",
        description: "PayPal 开发者后台生成的客户端 ID。",
        secret: false,
        inputType: "TEXT",
      },
      {
        key: "PAYPAL_CLIENT_SECRET",
        label: "Client Secret",
        description: "PayPal 开发者后台生成的客户端密钥。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
      },
    ],
  },
  {
    key: "stripe",
    label: "Stripe 配置",
    description: "当前仅需平台侧 Secret Key。",
    items: [
      {
        key: "STRIPE_SECRET_KEY",
        label: "Secret Key",
        description: "Stripe 平台分配的服务端密钥。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
      },
    ],
  },
];

export function SettingsPage() {
  const [providers, setProviders] = useState<ProviderCatalogItem[]>([]);
  const [configRecords, setConfigRecords] = useState<PlatformConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingGroupKey, setDeletingGroupKey] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [editingGroupKey, setEditingGroupKey] = useState<string>();
  const [messageApi, contextHolder] = message.useMessage();
  const [modalForm] = Form.useForm<ProviderModalValues>();

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
  const selectedProviderGroupKey = Form.useWatch("providerGroupKey", modalForm);
  const activeProviderGroupKey = selectedProviderGroupKey ?? editingGroupKey;

  const platformBaseUrl = useMemo(
    () => resolvePlatformBaseUrl(configRecords, apiBaseUrl),
    [apiBaseUrl, configRecords],
  );

  const providerRows = useMemo<ProviderConfigRow[]>(
    () =>
      PROVIDER_CONFIG_GROUPS.map((group) => {
        const provider = providers.find(
          (item) =>
            item.providerCode ===
            PROVIDER_GROUP_TO_CODE[
              group.key as keyof typeof PROVIDER_GROUP_TO_CODE
            ],
        );
        const record = configRecords.find((item) => item.key === group.key);
        const items = group.items.map((item) => {
          const configured = hasConfigValue(record?.value, item.key);
          const rawValue = record?.value[item.key];

          return {
            ...item,
            configured,
            value: typeof rawValue === "string" ? rawValue : undefined,
          };
        });

        return {
          groupKey: group.key,
          displayName: provider?.displayName ?? group.label,
          configured: Boolean(record),
          appIdValue: resolveGroupAppId(group.key, record?.value),
          notifyUrl: resolveGroupNotifyUrl(group.key, platformBaseUrl),
          gatewayModeLabel: resolveGroupGatewayMode(group.key, record?.value),
          items,
        };
      }),
    [configRecords, platformBaseUrl, providers],
  );

  const configuredProviderRows = useMemo(
    () => providerRows.filter((row) => row.configured),
    [providerRows],
  );

  const activeProviderGroup = useMemo(
    () =>
      PROVIDER_CONFIG_GROUPS.find((group) => group.key === activeProviderGroupKey),
    [activeProviderGroupKey],
  );

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    try {
      const [providersResponse, configsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/admin/channels`),
        fetch(`${apiBaseUrl}/admin/platform-configs`),
      ]);

      const providersJson = (await providersResponse.json()) as ApiEnvelope<
        ProviderCatalogItem[]
      >;
      const configsJson = (await configsResponse.json()) as ApiEnvelope<
        PlatformConfigRecord[]
      >;

      if (!providersResponse.ok) {
        throw new Error(providersJson.message || "加载渠道列表失败");
      }

      if (!configsResponse.ok) {
        throw new Error(configsJson.message || "加载平台配置失败");
      }

      setProviders(providersJson.data);
      setConfigRecords(configsJson.data);
    } catch (error) {
      setProviders([]);
      setConfigRecords([]);
      messageApi.error(getErrorMessage(error, "加载系统设置失败"));
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal(defaultGroupKey?: string) {
    modalForm.resetFields();
    setEditingGroupKey(undefined);
    modalForm.setFieldsValue({
      providerGroupKey: defaultGroupKey,
      ...(defaultGroupKey === "alipay"
        ? { ALIPAY_GATEWAY: DEFAULT_ALIPAY_GATEWAY }
        : {}),
    });
    setModalOpen(true);
  }

  function openEditModal(row: ProviderConfigRow) {
    setEditingGroupKey(row.groupKey);
    modalForm.resetFields();
    modalForm.setFieldsValue({
      providerGroupKey: row.groupKey,
      ...(row.groupKey === "alipay" &&
      !row.items.find((item) => item.key === "ALIPAY_GATEWAY")?.value
        ? { ALIPAY_GATEWAY: DEFAULT_ALIPAY_GATEWAY }
        : {}),
      ...Object.fromEntries(
        row.items
          .filter((item) => !item.secret && item.value !== undefined)
          .map((item) => [item.key, item.value ?? ""]),
      ),
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingGroupKey(undefined);
    modalForm.resetFields();
  }

  function handleProviderChange(groupKey: string) {
    if (groupKey === "alipay" && !modalForm.getFieldValue("ALIPAY_GATEWAY")) {
      modalForm.setFieldValue("ALIPAY_GATEWAY", DEFAULT_ALIPAY_GATEWAY);
    }
  }

  async function handleSubmitModal() {
    try {
      const values = await modalForm.validateFields();
      const groupKey = values.providerGroupKey;
      const targetGroup = PROVIDER_CONFIG_GROUPS.find(
        (group) => group.key === groupKey,
      );

      if (!targetGroup) {
        messageApi.error("请选择支付平台");
        return;
      }

      const targetRow = providerRows.find((row) => row.groupKey === groupKey);
      const nextValue: Record<string, string | null> = {};
      let hasMutation = false;

      targetRow?.items.forEach((item) => {
        const rawValue = values[item.key];
        const value = typeof rawValue === "string" ? rawValue.trim() : "";

        if (item.secret) {
          if (value) {
            nextValue[item.key] = value;
            hasMutation = true;
          }

          return;
        }

        if (value) {
          nextValue[item.key] = value;

          if (!item.configured || value !== item.value) {
            hasMutation = true;
          }

          return;
        }

        if (item.configured) {
          nextValue[item.key] = null;
          hasMutation = true;
        }
      });

      if (!hasMutation) {
        messageApi.error(
          editingGroupKey ? "没有检测到可保存的变更" : "请至少填写一个配置项",
        );
        return;
      }

      setModalSaving(true);

      const response = await fetch(`${apiBaseUrl}/admin/platform-configs`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: groupKey,
          value: nextValue,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<
        PlatformConfigRecord[] | null
      >;

      if (!response.ok) {
        throw new Error(json.message || "保存平台配置失败");
      }

      messageApi.success(editingGroupKey ? "平台配置已更新" : "平台配置已新增");
      closeModal();
      await loadSettings();
    } catch (error) {
      if (isFormValidationError(error)) {
        return;
      }

      messageApi.error(getErrorMessage(error, "保存平台配置失败"));
    } finally {
      setModalSaving(false);
    }
  }

  async function handleDeleteGroup(row: ProviderConfigRow) {
    setDeletingGroupKey(row.groupKey);

    try {
      const response = await fetch(
        `${apiBaseUrl}/admin/platform-configs/${row.groupKey}`,
        {
          method: "DELETE",
        },
      );
      const json = (await response.json()) as ApiEnvelope<
        PlatformConfigRecord[] | null
      >;

      if (!response.ok) {
        throw new Error(json.message || `删除配置 ${row.groupKey} 失败`);
      }

      messageApi.success(`${row.displayName} 配置已删除`);
      await loadSettings();
    } catch (error) {
      messageApi.error(getErrorMessage(error, "删除平台配置失败"));
    } finally {
      setDeletingGroupKey(undefined);
    }
  }

  function renderConfigInput(item: ProviderConfigItem) {
    if (item.key === "ALIPAY_GATEWAY") {
      return (
        <Select
          placeholder="请选择网关环境"
          options={ALIPAY_GATEWAY_OPTIONS}
        />
      );
    }

    const placeholder =
      item.placeholder ??
      (item.secret ? "已配置时不会回显，重新输入会覆盖当前值" : undefined);

    if (item.inputType === "TEXTAREA") {
      return (
        <Input.TextArea
          autoSize={{ minRows: 5, maxRows: 10 }}
          placeholder={placeholder}
        />
      );
    }

    if (item.inputType === "PASSWORD") {
      return (
        <Input.Password autoComplete="new-password" placeholder={placeholder} />
      );
    }

    return <Input placeholder={placeholder} />;
  }

  return (
    <>
      {contextHolder}
      <Spin spinning={loading}>
        <Card
          title="支付平台配置"
          extra={
            <Button type="primary" onClick={() => openCreateModal()}>
              新增配置
            </Button>
          }
        >
          <Table
            rowKey="groupKey"
            pagination={false}
            dataSource={configuredProviderRows}
            locale={{
              emptyText: (
                <Empty
                  description="暂无配置"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
            columns={[
              {
                title: "支付平台",
                dataIndex: "displayName",
                width: 180,
              },
              {
                title: "AppId",
                dataIndex: "appIdValue",
                render: (value?: string) =>
                  value ? (
                    <Typography.Text code copyable={{ text: value }}>
                      {value}
                    </Typography.Text>
                  ) : (
                    "-"
                  ),
              },
              {
                title: "回调地址",
                dataIndex: "notifyUrl",
                render: (value?: string) =>
                  value ? (
                    <Typography.Text code copyable={{ text: value }}>
                      {value}
                    </Typography.Text>
                  ) : (
                    "-"
                  ),
              },
              {
                title: "网关方式",
                key: "gatewayMode",
                width: 140,
                render: (_: unknown, row: ProviderConfigRow) => (
                  row.gatewayModeLabel ?? "-"
                ),
              },
              {
                title: "操作",
                key: "actions",
                width: 180,
                render: (_: unknown, row: ProviderConfigRow) => (
                  <Space size={4}>
                    <Button type="link" onClick={() => openEditModal(row)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除平台配置"
                      description={`删除后会清空 ${row.displayName} 的整组配置。`}
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void handleDeleteGroup(row)}
                    >
                      <Button
                        type="link"
                        danger
                        loading={deletingGroupKey === row.groupKey}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Spin>

      <Modal
        title={editingGroupKey ? "编辑支付平台配置" : "新增支付平台配置"}
        open={modalOpen}
        destroyOnHidden
        onCancel={closeModal}
        onOk={() => void handleSubmitModal()}
        okText={editingGroupKey ? "保存" : "新增"}
        confirmLoading={modalSaving}
        width={860}
      >
        <Form layout="vertical" form={modalForm}>
          <Form.Item
            name="providerGroupKey"
            label="支付平台"
            rules={[{ required: true, message: "请选择支付平台" }]}
          >
            <Select
              disabled={Boolean(editingGroupKey)}
              placeholder="请选择支付平台"
              onChange={handleProviderChange}
              options={PROVIDER_CONFIG_GROUPS
                .filter(
                  (group) =>
                    !configuredProviderRows.some(
                      (row) => row.groupKey === group.key,
                    ) || group.key === editingGroupKey,
                )
                .map((group) => ({
                  label:
                    providers.find(
                      (item) =>
                        item.providerCode ===
                        PROVIDER_GROUP_TO_CODE[
                          group.key as keyof typeof PROVIDER_GROUP_TO_CODE
                        ],
                    )?.displayName ?? group.label,
                  value: group.key,
                }))}
            />
          </Form.Item>

          {activeProviderGroup ? (
            <Row gutter={[16, 0]}>
              {activeProviderGroup.items.map((item) => {
                const activeItem = providerRows
                  .find((row) => row.groupKey === activeProviderGroup.key)
                  ?.items.find((candidate) => candidate.key === item.key);

                if (!activeItem) {
                  return null;
                }

                return (
                  <Col
                    xs={24}
                    md={item.inputType === "TEXTAREA" ? 24 : 12}
                    key={item.key}
                  >
                    <Form.Item
                      name={item.key}
                      label={
                        <Space size={8}>
                          <span>{item.label}</span>
                          {item.secret ? <Tag color="volcano">私密</Tag> : null}
                          <Tooltip
                            placement="topLeft"
                            title={
                              <Space direction="vertical" size={2}>
                                <span>{item.description}</span>
                                <Typography.Text
                                  style={{ color: "rgba(255,255,255,0.72)" }}
                                >
                                  {item.key}
                                </Typography.Text>
                                {item.secret && activeItem.configured ? (
                                  <span>
                                    已配置时不会回显，留空表示保持不变。
                                  </span>
                                ) : null}
                                {!item.secret && activeItem.configured ? (
                                  <span>清空后保存会删除该字段当前配置。</span>
                                ) : null}
                              </Space>
                            }
                          >
                            <Typography.Text
                              type="secondary"
                              style={{ cursor: "help" }}
                            >
                              <InfoCircleOutlined />
                            </Typography.Text>
                          </Tooltip>
                        </Space>
                      }
                    >
                      {renderConfigInput(activeItem)}
                    </Form.Item>
                  </Col>
                );
              })}
            </Row>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function isFormValidationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorFields" in error &&
    Array.isArray((error as { errorFields?: unknown[] }).errorFields)
  );
}

function hasConfigValue(
  value: Record<string, string | null> | undefined,
  key: string,
): boolean {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function resolvePlatformBaseUrl(
  records: PlatformConfigRecord[],
  apiBaseUrl: string,
): string | undefined {
  const configuredBaseUrl = records
    .find((record) => record.key === "platform")
    ?.value.APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return apiBaseUrl
    .replace(/\/api\/v1\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
}

function resolveGroupAppId(
  groupKey: string,
  value?: Record<string, string | null>,
): string | undefined {
  const appIdKey =
    PROVIDER_GROUP_APP_ID_KEY[
      groupKey as keyof typeof PROVIDER_GROUP_APP_ID_KEY
    ];

  if (!appIdKey) {
    return undefined;
  }

  const appIdValue = value?.[appIdKey];
  return typeof appIdValue === "string" ? appIdValue.trim() || undefined : undefined;
}

function resolveGroupNotifyUrl(
  groupKey: string,
  platformBaseUrl?: string,
): string | undefined {
  const notifyPath =
    PROVIDER_GROUP_NOTIFY_PATH[
      groupKey as keyof typeof PROVIDER_GROUP_NOTIFY_PATH
    ];

  if (!notifyPath || !platformBaseUrl) {
    return undefined;
  }

  return `${platformBaseUrl}${notifyPath}`;
}

function resolveGroupGatewayMode(
  groupKey: string,
  value?: Record<string, string | null>,
): string | undefined {
  if (groupKey !== "alipay") {
    return undefined;
  }

  const gatewayValue = value?.ALIPAY_GATEWAY?.trim();

  if (!gatewayValue) {
    return ALIPAY_GATEWAY_OPTIONS[0]?.label;
  }

  return (
    ALIPAY_GATEWAY_OPTIONS.find((option) => option.value === gatewayValue)?.label ??
    "自定义"
  );
}
