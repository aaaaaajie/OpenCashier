import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Alert,
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
} from "antd";

type ProviderCatalogItem = {
  providerCode: string;
  displayName: string;
  integrationMode: string;
  officialSdkPackage?: string;
  enabled: boolean;
};

type AlipayAuthMode = "KEY" | "CERT";
type AlipayProductCapability = "QR" | "PAGE" | "WAP";
type WechatPayVerifyMode = "PUBLIC_KEY" | "CERT";
type ProviderConfigMode = AlipayAuthMode | WechatPayVerifyMode;

type PlatformConfigInputType =
  | "TEXT"
  | "TEXTAREA"
  | "PASSWORD"
  | "SELECT"
  | "MULTI_SELECT";

type PlatformConfigOption = {
  label: string;
  value: string;
};

type PlatformConfigDocLink = {
  label: string;
  href: string;
};

type PlatformConfigItemDefinition = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  inputType: PlatformConfigInputType;
  placeholder?: string;
  options?: PlatformConfigOption[];
  docLinks?: PlatformConfigDocLink[];
  visibleInAlipayAuthModes?: AlipayAuthMode[];
  visibleInWechatPayVerifyModes?: WechatPayVerifyMode[];
};

type PlatformConfigGroupDefinition = {
  key: string;
  label: string;
  description: string;
  items: PlatformConfigItemDefinition[];
};

type PlatformConfigStageRecord = {
  id: string;
  value: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
};

type PlatformConfigRecord = {
  key: string;
  active?: PlatformConfigStageRecord;
  draft?: PlatformConfigStageRecord;
};

type ProviderConfigItem = PlatformConfigItemDefinition & {
  configured: boolean;
  value?: string;
};

type ProviderConfigRow = {
  groupKey: string;
  displayName: string;
  configured: boolean;
  hasActive: boolean;
  hasDraft: boolean;
  statusLabel: string;
  statusColor: string;
  appIdValue?: string;
  notifyUrl?: string;
  authModeValue?: ProviderConfigMode;
  authModeLabel?: string;
  gatewayModeLabel?: string;
  editableItems: ProviderConfigItem[];
};

type ApiEnvelope<T> = {
  message: string;
  data: T;
};

type ProviderConfigValidationStatus = "SUCCESS" | "FAILED" | "UNSUPPORTED";

type ProviderConfigValidationResult = {
  configKey: string;
  providerCode?: string;
  displayName?: string;
  status: ProviderConfigValidationStatus;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
};

type ProviderModalValues = Record<string, string | string[]> & {
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
  wechatpay: "/api/v1/notify/wechatpay",
} as const satisfies Partial<
  Record<keyof typeof PROVIDER_GROUP_TO_CODE, string>
>;

const ALIPAY_GATEWAY_OPTIONS = [
  {
    label: "正式生产",
    value: "https://openapi.alipay.com/gateway.do",
  },
  {
    label: "沙箱测试",
    value: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  },
];

const ALIPAY_AUTH_MODE_OPTIONS = [
  {
    label: "密钥模式",
    value: "KEY",
  },
  {
    label: "证书模式",
    value: "CERT",
  },
] satisfies PlatformConfigOption[];

const ALIPAY_PRODUCT_CAPABILITY_OPTIONS = [
  {
    label: "当面付二维码",
    value: "QR",
  },
  {
    label: "电脑网站支付",
    value: "PAGE",
  },
  {
    label: "手机网站支付",
    value: "WAP",
  },
] satisfies PlatformConfigOption[];

const WECHATPAY_VERIFY_MODE_OPTIONS = [
  {
    label: "微信支付公钥模式",
    value: "PUBLIC_KEY",
  },
  {
    label: "平台证书模式",
    value: "CERT",
  },
] satisfies PlatformConfigOption[];

const DEFAULT_ALIPAY_AUTH_MODE: AlipayAuthMode = "KEY";
const DEFAULT_WECHATPAY_VERIFY_MODE: WechatPayVerifyMode = "PUBLIC_KEY";
const DEFAULT_ALIPAY_PRODUCT_CAPABILITIES: AlipayProductCapability[] = [
  "QR",
  "PAGE",
  "WAP",
];

const DEFAULT_ALIPAY_GATEWAY = ALIPAY_GATEWAY_OPTIONS[0]?.value ?? "";

const PROVIDER_CONFIG_GROUPS: PlatformConfigGroupDefinition[] = [
  {
    key: "alipay",
    label: "支付宝配置",
    description:
      "支持密钥模式和证书模式；私钥、公钥、证书都支持直接粘贴内容或填写服务器本地文件路径。",
    items: [
      {
        key: "ALIPAY_AUTH_MODE",
        label: "接入方式",
        description: "选择密钥模式或证书模式。",
        secret: false,
        inputType: "SELECT",
        options: ALIPAY_AUTH_MODE_OPTIONS,
      },
      {
        key: "ALIPAY_PRODUCT_CAPABILITIES",
        label: "已开通产品",
        description:
          "统一收银台会按这里的能力优先生成二维码、电脑网站支付或手机网站支付，并在失败时做同渠道回退。",
        secret: false,
        inputType: "MULTI_SELECT",
        options: ALIPAY_PRODUCT_CAPABILITY_OPTIONS,
      },
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
        visibleInAlipayAuthModes: ["KEY"],
      },
      {
        key: "ALIPAY_APP_CERT",
        label: "应用公钥证书",
        description:
          "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA",
        visibleInAlipayAuthModes: ["CERT"],
      },
      {
        key: "ALIPAY_PUBLIC_CERT",
        label: "支付宝公钥证书",
        description:
          "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA",
        visibleInAlipayAuthModes: ["CERT"],
      },
      {
        key: "ALIPAY_ROOT_CERT",
        label: "支付宝根证书",
        description:
          "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA",
        visibleInAlipayAuthModes: ["CERT"],
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
    description:
      "支持微信支付公钥模式和平台证书模式；私钥、公钥、证书支持直接粘贴内容或填写服务器本地文件路径。",
    items: [
      {
        key: "WECHATPAY_VERIFY_MODE",
        label: "验签方式",
        description: "",
        secret: false,
        inputType: "SELECT",
        options: WECHATPAY_VERIFY_MODE_OPTIONS,
        docLinks: [
          {
            label: "微信支付公钥验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053249",
          },
          {
            label: "平台证书验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053420",
          },
          {
            label: "公钥切换证书说明",
            href: "https://pay.wechatpay.cn/doc/v3/partner/4015419376",
          },
        ],
      },
      {
        key: "WECHATPAY_APP_ID",
        label: "应用 ID",
        description: "与当前商户号绑定的 AppID。",
        secret: false,
        inputType: "TEXT",
        docLinks: [
          {
            label: "开发必要参数说明",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013070756",
          },
        ],
      },
      {
        key: "WECHATPAY_MCH_ID",
        label: "商户号",
        description: "微信支付分配的商户身份标识。",
        secret: false,
        inputType: "TEXT",
        docLinks: [
          {
            label: "开发必要参数说明",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013070756",
          },
        ],
      },
      {
        key: "WECHATPAY_API_V3_KEY",
        label: "API v3 密钥",
        description: "32 位对称密钥，用于解密回调；",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
        docLinks: [
          {
            label: "开发必要参数说明",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013070756",
          },
        ],
      },
      {
        key: "WECHATPAY_MCH_SERIAL_NO",
        label: "商户 API 证书序列号",
        description: "商户证书序列号",
        secret: false,
        inputType: "TEXT",
        docLinks: [
          {
            label: "开发必要参数说明",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013070756",
          },
          {
            label: "平台证书验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053420",
          },
        ],
      },
      {
        key: "WECHATPAY_PRIVATE_KEY",
        label: "商户 API 证书私钥",
        description: "商户证书对应的私钥内容，通常是 apiclient_key.pem。",
        secret: true,
        inputType: "TEXTAREA",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置",
        docLinks: [
          {
            label: "平台证书验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053420",
          },
          {
            label: "开发必要参数说明",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013070756",
          },
        ],
      },
      {
        key: "WECHATPAY_PUBLIC_KEY_ID",
        label: "微信支付公钥 ID",
        description: "公钥模式下用于匹配微信支付公钥。",
        secret: false,
        inputType: "TEXT",
        visibleInWechatPayVerifyModes: ["PUBLIC_KEY"],
        docLinks: [
          {
            label: "微信支付公钥验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053249",
          },
        ],
      },
      {
        key: "WECHATPAY_PUBLIC_KEY",
        label: "微信支付公钥",
        description: "公钥模式下用于验证微信应答和回调签名。",
        secret: false,
        inputType: "TEXTAREA",
        visibleInWechatPayVerifyModes: ["PUBLIC_KEY"],
        docLinks: [
          {
            label: "微信支付公钥验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053249",
          },
        ],
      },
      {
        key: "WECHATPAY_PLATFORM_CERT_SERIAL_NO",
        label: "平台证书序列号",
        description: "",
        secret: false,
        inputType: "TEXT",
        visibleInWechatPayVerifyModes: ["CERT"],
        docLinks: [
          {
            label: "平台证书验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053420",
          },
        ],
      },
      {
        key: "WECHATPAY_PLATFORM_CERT",
        label: "微信支付平台证书",
        description: "平台证书模式下用于验证微信应答和回调签名。",
        secret: false,
        inputType: "TEXTAREA",
        visibleInWechatPayVerifyModes: ["CERT"],
        docLinks: [
          {
            label: "平台证书验签",
            href: "https://pay.wechatpay.cn/doc/v3/merchant/4013053420",
          },
        ],
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
  const [activatingGroupKey, setActivatingGroupKey] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalValidating, setModalValidating] = useState(false);
  const [modalValidationResult, setModalValidationResult] =
    useState<ProviderConfigValidationResult>();
  const [editingGroupKey, setEditingGroupKey] = useState<string>();
  const { message: messageApi, modal } = AntdApp.useApp();
  const [modalForm] = Form.useForm<ProviderModalValues>();

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
  const selectedProviderGroupKey = Form.useWatch("providerGroupKey", modalForm);
  const selectedAlipayAuthMode = Form.useWatch("ALIPAY_AUTH_MODE", modalForm);
  const selectedWechatPayVerifyMode = Form.useWatch(
    "WECHATPAY_VERIFY_MODE",
    modalForm,
  );
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
        const effectiveValue = record?.active?.value ?? record?.draft?.value;
        const editableValue = record?.draft?.value ?? record?.active?.value;
        const authMode = resolveGroupAuthMode(group.key, effectiveValue);
        const editableItems = buildProviderConfigItems(group, editableValue);
        const { label: statusLabel, color: statusColor } = resolveConfigRowStatus(
          record,
        );

        return {
          groupKey: group.key,
          displayName: provider?.displayName ?? group.label,
          configured: Boolean(record?.active || record?.draft),
          hasActive: Boolean(record?.active),
          hasDraft: Boolean(record?.draft),
          statusLabel,
          statusColor,
          appIdValue: resolveGroupAppId(group.key, effectiveValue),
          notifyUrl: resolveGroupNotifyUrl(group.key, platformBaseUrl),
          authModeValue: authMode,
          authModeLabel: resolveGroupAuthModeLabel(group.key, effectiveValue),
          gatewayModeLabel: resolveGroupGatewayMode(group.key, effectiveValue),
          editableItems,
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

  const activeAlipayAuthMode = useMemo(() => {
    if (activeProviderGroupKey !== "alipay") {
      return undefined;
    }

    const persistedMode = providerRows.find((row) => row.groupKey === "alipay")
      ?.authModeValue;

    return normalizeAlipayAuthMode(
      toSingleFieldValue(selectedAlipayAuthMode) ?? persistedMode,
    );
  }, [activeProviderGroupKey, providerRows, selectedAlipayAuthMode]);

  const activeWechatPayVerifyMode = useMemo(() => {
    if (activeProviderGroupKey !== "wechatpay") {
      return undefined;
    }

    const persistedMode = providerRows.find((row) => row.groupKey === "wechatpay")
      ?.authModeValue;

    return normalizeWechatPayVerifyMode(
      toSingleFieldValue(selectedWechatPayVerifyMode) ?? persistedMode,
    );
  }, [activeProviderGroupKey, providerRows, selectedWechatPayVerifyMode]);

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
    setModalValidationResult(undefined);
    modalForm.setFieldsValue({
      providerGroupKey: defaultGroupKey,
      ...(defaultGroupKey === "alipay"
        ? {
            ALIPAY_AUTH_MODE: DEFAULT_ALIPAY_AUTH_MODE,
            ALIPAY_PRODUCT_CAPABILITIES: DEFAULT_ALIPAY_PRODUCT_CAPABILITIES,
            ALIPAY_GATEWAY: DEFAULT_ALIPAY_GATEWAY,
          }
        : defaultGroupKey === "wechatpay"
          ? {
              WECHATPAY_VERIFY_MODE: DEFAULT_WECHATPAY_VERIFY_MODE,
            }
        : {}),
    });
    setModalOpen(true);
  }

  function openEditModal(row: ProviderConfigRow) {
    setEditingGroupKey(row.groupKey);
    modalForm.resetFields();
    setModalValidationResult(undefined);
    modalForm.setFieldsValue({
      providerGroupKey: row.groupKey,
      ...(row.groupKey === "alipay"
        ? {
            ALIPAY_AUTH_MODE:
              row.authModeValue ?? DEFAULT_ALIPAY_AUTH_MODE,
            ALIPAY_PRODUCT_CAPABILITIES:
              parseMultiSelectValue(
                row.editableItems.find(
                  (item) => item.key === "ALIPAY_PRODUCT_CAPABILITIES",
                )?.value,
              ) ?? DEFAULT_ALIPAY_PRODUCT_CAPABILITIES,
            ALIPAY_GATEWAY:
              row.editableItems.find((item) => item.key === "ALIPAY_GATEWAY")
                ?.value ??
              DEFAULT_ALIPAY_GATEWAY,
          }
        : row.groupKey === "wechatpay"
          ? {
              WECHATPAY_VERIFY_MODE:
                row.authModeValue ?? DEFAULT_WECHATPAY_VERIFY_MODE,
            }
        : {}),
      ...Object.fromEntries(
        row.editableItems
          .filter((item) => !item.secret && item.value !== undefined)
          .map((item) => [item.key, toFormFieldValue(item)]),
      ),
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingGroupKey(undefined);
    setModalValidationResult(undefined);
    modalForm.resetFields();
  }

  function handleProviderChange(groupKey: string) {
    setModalValidationResult(undefined);

    if (groupKey === "alipay") {
      if (!modalForm.getFieldValue("ALIPAY_AUTH_MODE")) {
        modalForm.setFieldValue("ALIPAY_AUTH_MODE", DEFAULT_ALIPAY_AUTH_MODE);
      }

      if (!modalForm.getFieldValue("ALIPAY_PRODUCT_CAPABILITIES")) {
        modalForm.setFieldValue(
          "ALIPAY_PRODUCT_CAPABILITIES",
          DEFAULT_ALIPAY_PRODUCT_CAPABILITIES,
        );
      }

      if (!modalForm.getFieldValue("ALIPAY_GATEWAY")) {
        modalForm.setFieldValue("ALIPAY_GATEWAY", DEFAULT_ALIPAY_GATEWAY);
      }

      return;
    }

    if (groupKey === "wechatpay") {
      if (!modalForm.getFieldValue("WECHATPAY_VERIFY_MODE")) {
        modalForm.setFieldValue(
          "WECHATPAY_VERIFY_MODE",
          DEFAULT_WECHATPAY_VERIFY_MODE,
        );
      }
    }
  }

  function handleModalValuesChange() {
    if (modalValidationResult) {
      setModalValidationResult(undefined);
    }
  }

  async function handleSubmitModal() {
    try {
      const values = await modalForm.validateFields();
      const groupKey = values.providerGroupKey;

      if (!groupKey) {
        messageApi.error("请选择支付平台");
        return;
      }

      const targetGroup = PROVIDER_CONFIG_GROUPS.find(
        (group) => group.key === groupKey,
      );

      if (!targetGroup) {
        messageApi.error("请选择支付平台");
        return;
      }

      if (
        !modalValidationResult ||
        modalValidationResult.configKey !== groupKey ||
        !["SUCCESS", "UNSUPPORTED"].includes(modalValidationResult.status)
      ) {
        messageApi.error("请先在弹窗中完成验证，再保存草稿");
        return;
      }

      const targetRow = providerRows.find((row) => row.groupKey === groupKey);
      const { patchValue, hasMutation } = buildConfigPatch(
        targetGroup,
        values,
        targetRow?.editableItems,
      );

      if (!hasMutation) {
        messageApi.error(
          editingGroupKey ? "没有检测到可保存的草稿变更" : "请至少填写一个配置项",
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
          value: patchValue,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<
        PlatformConfigRecord[] | null
      >;

      if (!response.ok) {
        throw new Error(json.message || "保存平台配置失败");
      }

      messageApi.success(
        `${targetGroup.label}草稿已保存，请回到表格点击“生效”后再应用到真实支付流程`,
      );
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

  async function handleValidateModal() {
    try {
      const values = await modalForm.validateFields();
      const groupKey = values.providerGroupKey;

      if (!groupKey) {
        messageApi.error("请选择支付平台");
        return;
      }

      const targetGroup = PROVIDER_CONFIG_GROUPS.find(
        (group) => group.key === groupKey,
      );

      if (!targetGroup) {
        messageApi.error("请选择支付平台");
        return;
      }

      const targetRow = providerRows.find((row) => row.groupKey === groupKey);
      const { patchValue } = buildConfigPatch(
        targetGroup,
        values,
        targetRow?.editableItems,
      );

      setModalValidating(true);

      const response = await fetch(
        `${apiBaseUrl}/admin/platform-configs/${groupKey}/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value: patchValue,
          }),
        },
      );
      const json = (await response.json()) as ApiEnvelope<
        ProviderConfigValidationResult
      >;

      if (!response.ok) {
        throw new Error(json.message || `验证 ${targetGroup.label} 配置失败`);
      }

      setModalValidationResult(json.data);

      if (json.data.status === "SUCCESS") {
        messageApi.success(`${targetGroup.label}配置验证通过`);
        return;
      }

      if (json.data.status === "UNSUPPORTED") {
        messageApi.info(`${targetGroup.label}暂不支持在线验证，可以直接保存草稿`);
      }
    } catch (error) {
      if (isFormValidationError(error)) {
        return;
      }

      messageApi.error(getErrorMessage(error, "验证平台配置失败"));
    } finally {
      setModalValidating(false);
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

  function handleActivateGroup(row: ProviderConfigRow) {
    modal.confirm({
      title: `生效 ${row.displayName} 配置`,
      icon: <ExclamationCircleFilled />,
      content: `${row.displayName} 的草稿配置生效后，会立即影响当前正在使用的支付能力。请确认草稿已经验证通过，并且可以用于真实支付。`,
      okText: "确认生效",
      cancelText: "取消",
      okButtonProps: {
        loading: activatingGroupKey === row.groupKey,
      },
      onOk: async () => {
        setActivatingGroupKey(row.groupKey);

        try {
          const response = await fetch(
            `${apiBaseUrl}/admin/platform-configs/${row.groupKey}/activate`,
            {
              method: "POST",
            },
          );
          const json = (await response.json()) as ApiEnvelope<
            PlatformConfigRecord[] | null
          >;

          if (!response.ok) {
            throw new Error(json.message || `生效 ${row.displayName} 配置失败`);
          }

          messageApi.success(`${row.displayName}配置已生效`);
          await loadSettings();
        } catch (error) {
          messageApi.error(getErrorMessage(error, "平台配置生效失败"));
          throw error;
        } finally {
          setActivatingGroupKey(undefined);
        }
      },
    });
  }

  function renderConfigInput(item: ProviderConfigItem) {
    if (item.inputType === "MULTI_SELECT") {
      return (
        <Select
          mode="multiple"
          placeholder="请选择"
          options={item.options}
        />
      );
    }

    if (item.inputType === "SELECT") {
      return (
        <Select
          placeholder="请选择"
          options={item.options}
        />
      );
    }

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
                title: "状态",
                key: "status",
                width: 130,
                render: (_: unknown, row: ProviderConfigRow) => (
                  <Tag color={row.statusColor}>{row.statusLabel}</Tag>
                ),
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
                title: "接入方式",
                dataIndex: "authModeLabel",
                width: 140,
                render: (value?: string) => value ?? "-",
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
                width: 240,
                render: (_: unknown, row: ProviderConfigRow) => (
                  <Space size={4}>
                    <Tooltip
                      title={
                        row.hasDraft
                          ? "将当前草稿推送为线上生效配置"
                          : "当前没有待生效草稿"
                      }
                    >
                      <span>
                        <Button
                          type="link"
                          disabled={!row.hasDraft}
                          loading={activatingGroupKey === row.groupKey}
                          onClick={() => handleActivateGroup(row)}
                        >
                          生效
                        </Button>
                      </span>
                    </Tooltip>
                    <Button type="link" onClick={() => openEditModal(row)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除平台配置"
                      description={`删除后会同时清空 ${row.displayName} 的草稿和已生效配置。`}
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
        title={editingGroupKey ? "编辑" : "新增"}
        open={modalOpen}
        destroyOnHidden
        onCancel={closeModal}
        width={860}
        footer={[
          <Button key="cancel" onClick={closeModal}>
            取消
          </Button>,
          <Button
            key="validate"
            icon={
              modalValidationResult?.status === "SUCCESS" ? (
                <CheckCircleFilled style={{ color: "#52c41a" }} />
              ) : (
                <SafetyCertificateOutlined />
              )
            }
            loading={modalValidating}
            onClick={() => void handleValidateModal()}
          >
            {modalValidationResult?.status === "SUCCESS"
              ? "验证已通过"
              : "验证配置"}
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={modalSaving}
            disabled={
              !modalValidationResult ||
              !["SUCCESS", "UNSUPPORTED"].includes(modalValidationResult.status)
            }
            onClick={() => void handleSubmitModal()}
          >
            保存草稿
          </Button>,
        ]}
      >
        <Form
          layout="vertical"
          form={modalForm}
          onValuesChange={handleModalValuesChange}
        >
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
            <>
              <Row gutter={[16, 0]}>
              {activeProviderGroup.items
                .filter((item) =>
                  isConfigItemVisible(
                    activeProviderGroup.key,
                    item,
                    activeAlipayAuthMode,
                    activeWechatPayVerifyMode,
                  ),
                )
                .map((item) => {
                  const editableItems =
                    providerRows.find((row) => row.groupKey === activeProviderGroup.key)
                      ?.editableItems ?? buildProviderConfigItems(activeProviderGroup);
                  const activeItem = editableItems.find(
                    (candidate) => candidate.key === item.key,
                  );

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
                                  {item.description ? <span>{item.description}</span> : null}
                                  {item.docLinks?.length ? (
                                    <Space wrap size={[8, 4]}>
                                      <span>更多:</span>
                                      {item.docLinks.map((doc) => (
                                        <Typography.Link
                                          key={doc.href}
                                          href={doc.href}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {doc.label}
                                        </Typography.Link>
                                      ))}
                                    </Space>
                                  ) : null}
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
                                <QuestionCircleOutlined />
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
            </>
          ) : null}

          {modalValidationResult ? (
            <Alert
              showIcon
              type={
                modalValidationResult.status === "SUCCESS"
                  ? "success"
                  : modalValidationResult.status === "FAILED"
                    ? "error"
                    : "info"
              }
              message={
                modalValidationResult.status === "SUCCESS"
                  ? "验证通过"
                  : modalValidationResult.status === "FAILED"
                    ? "验证未通过"
                    : "暂不支持在线验证"
              }
              description={`${modalValidationResult.message}（${new Date(
                modalValidationResult.checkedAt,
              ).toLocaleString("zh-CN", {
                hour12: false,
              })}）`}
            />
          ) : null}
        </Form>
      </Modal>
    </>
  );
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

function buildProviderConfigItems(
  group: PlatformConfigGroupDefinition,
  value?: Record<string, string | null>,
): ProviderConfigItem[] {
  return group.items.map((item) => {
    const configured = hasConfigValue(value, item.key);
    const rawValue = value?.[item.key];

    return {
      ...item,
      configured,
      value: typeof rawValue === "string" ? rawValue : undefined,
    };
  });
}

function buildConfigPatch(
  group: PlatformConfigGroupDefinition,
  values: ProviderModalValues,
  currentItems?: ProviderConfigItem[],
): {
  patchValue: Record<string, string | null>;
  hasMutation: boolean;
} {
  const currentItemMap = new Map(
    (currentItems ?? buildProviderConfigItems(group)).map((item) => [item.key, item]),
  );
  const patchValue: Record<string, string | null> = {};
  let hasMutation = false;
  const alipayAuthMode = normalizeAlipayAuthMode(
    group.key === "alipay" ? toSingleFieldValue(values.ALIPAY_AUTH_MODE) : undefined,
  );
  const wechatPayVerifyMode = normalizeWechatPayVerifyMode(
    group.key === "wechatpay"
      ? toSingleFieldValue(values.WECHATPAY_VERIFY_MODE)
      : undefined,
  );

  group.items.forEach((item) => {
    const currentItem =
      currentItemMap.get(item.key) ??
      ({
        ...item,
        configured: false,
      } satisfies ProviderConfigItem);
    const visible = isConfigItemVisible(
      group.key,
      item,
      alipayAuthMode,
      wechatPayVerifyMode,
    );

    if (!visible) {
      if (currentItem.configured) {
        patchValue[item.key] = null;
        hasMutation = true;
      }

      return;
    }

    const value = normalizeFormFieldValue(values[item.key], item.inputType);

    if (item.secret) {
      if (value) {
        patchValue[item.key] = value;
        hasMutation = true;
      }

      return;
    }

    if (value) {
      patchValue[item.key] = value;

      if (!currentItem.configured || value !== currentItem.value) {
        hasMutation = true;
      }

      return;
    }

    if (currentItem.configured) {
      patchValue[item.key] = null;
      hasMutation = true;
    }
  });

  return {
    patchValue,
    hasMutation,
  };
}

function resolveConfigRowStatus(record?: PlatformConfigRecord): {
  label: string;
  color: string;
} {
  if (record?.draft && record?.active) {
    return {
      label: "待生效草稿",
      color: "orange",
    };
  }

  if (record?.draft) {
    return {
      label: "仅草稿",
      color: "blue",
    };
  }

  return {
    label: "已生效",
    color: "green",
  };
}

function normalizeFormFieldValue(
  rawValue: string | string[] | undefined,
  inputType: PlatformConfigInputType,
): string {
  if (inputType === "MULTI_SELECT") {
    return Array.isArray(rawValue)
      ? rawValue.map((item) => item.trim()).filter(Boolean).join(",")
      : "";
  }

  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function toSingleFieldValue(
  rawValue: string | string[] | undefined,
): string | undefined {
  return typeof rawValue === "string" ? rawValue : undefined;
}

function parseMultiSelectValue(value?: string): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const result = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return result.length > 0 ? result : undefined;
}

function toFormFieldValue(item: ProviderConfigItem): string | string[] | undefined {
  if (item.inputType === "MULTI_SELECT") {
    return parseMultiSelectValue(item.value);
  }

  return item.value;
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

function normalizeAlipayAuthMode(
  value?: string | null,
): AlipayAuthMode {
  return value?.trim().toUpperCase() === "CERT" ? "CERT" : "KEY";
}

function normalizeWechatPayVerifyMode(
  value?: string | null,
): WechatPayVerifyMode {
  return value?.trim().toUpperCase() === "CERT" ? "CERT" : "PUBLIC_KEY";
}

function isConfigItemVisible(
  groupKey: string,
  item: Pick<
    PlatformConfigItemDefinition,
    "visibleInAlipayAuthModes" | "visibleInWechatPayVerifyModes"
  >,
  alipayAuthMode?: AlipayAuthMode,
  wechatPayVerifyMode?: WechatPayVerifyMode,
): boolean {
  if (groupKey === "alipay" && item.visibleInAlipayAuthModes?.length) {
    return item.visibleInAlipayAuthModes.includes(
      alipayAuthMode ?? DEFAULT_ALIPAY_AUTH_MODE,
    );
  }

  if (groupKey === "wechatpay" && item.visibleInWechatPayVerifyModes?.length) {
    return item.visibleInWechatPayVerifyModes.includes(
      wechatPayVerifyMode ?? DEFAULT_WECHATPAY_VERIFY_MODE,
    );
  }

  return true;
}

function resolvePlatformBaseUrl(
  records: PlatformConfigRecord[],
  apiBaseUrl: string,
): string | undefined {
  const configuredBaseUrl = records
    .find((record) => record.key === "platform")
    ?.active?.value.APP_BASE_URL?.trim();

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

function resolveGroupAuthMode(
  groupKey: string,
  value?: Record<string, string | null>,
): ProviderConfigMode | undefined {
  if (groupKey === "wechatpay") {
    if (value?.WECHATPAY_VERIFY_MODE?.trim()) {
      return normalizeWechatPayVerifyMode(value.WECHATPAY_VERIFY_MODE);
    }

    if (
      value?.WECHATPAY_PLATFORM_CERT_SERIAL_NO ||
      value?.WECHATPAY_PLATFORM_CERT
    ) {
      return "CERT";
    }

    return "PUBLIC_KEY";
  }

  if (groupKey !== "alipay") {
    return undefined;
  }

  if (value?.ALIPAY_AUTH_MODE?.trim()) {
    return normalizeAlipayAuthMode(value.ALIPAY_AUTH_MODE);
  }

  if (
    value?.ALIPAY_APP_CERT ||
    value?.ALIPAY_PUBLIC_CERT ||
    value?.ALIPAY_ROOT_CERT
  ) {
    return "CERT";
  }

  return "KEY";
}

function resolveGroupAuthModeLabel(
  groupKey: string,
  value?: Record<string, string | null>,
): string | undefined {
  const authMode = resolveGroupAuthMode(groupKey, value);

  if (!authMode) {
    return undefined;
  }

  if (groupKey === "wechatpay") {
    return (
      WECHATPAY_VERIFY_MODE_OPTIONS.find((option) => option.value === authMode)
        ?.label ?? authMode
    );
  }

  return (
    ALIPAY_AUTH_MODE_OPTIONS.find((option) => option.value === authMode)?.label ??
    authMode
  );
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
