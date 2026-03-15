export type PlatformConfigInputType =
  | "TEXT"
  | "TEXTAREA"
  | "PASSWORD"
  | "SELECT"
  | "MULTI_SELECT";

export interface PlatformConfigItemOption {
  label: string;
  value: string;
}

export interface PlatformConfigItemDefinition {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  inputType: PlatformConfigInputType;
  placeholder?: string;
  options?: PlatformConfigItemOption[];
}

export interface PlatformConfigGroupDefinition {
  key: string;
  label: string;
  description: string;
  items: PlatformConfigItemDefinition[];
}

export const PLATFORM_CONFIG_GROUPS: PlatformConfigGroupDefinition[] = [
  {
    key: "platform",
    label: "平台基础配置",
    description: "控制收银台签名、平台回调和后台地址等基础运行参数。",
    items: [
      {
        key: "APP_SECRET",
        label: "平台签名密钥",
        description: "用于签发公开收银台 token。建议使用高强度随机字符串。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "重新输入会覆盖当前数据库配置"
      },
      {
        key: "APP_BASE_URL",
        label: "平台 API 地址",
        description: "用于拼接默认的支付渠道异步通知回调地址，以及商户侧实际使用的 cashierUrl 入口。",
        secret: false,
        inputType: "TEXT",
        placeholder: "例如 http://localhost:3000"
      },
      {
        key: "WEB_BASE_URL",
        label: "后台/收银台地址",
        description: "用于生成扫码页、多支付品牌选择页等前端收银台页面地址。",
        secret: false,
        inputType: "TEXT",
        placeholder: "例如 http://localhost:5173"
      }
    ]
  },
  {
    key: "alipay",
    label: "支付宝配置",
    description:
      "支持普通公钥模式和证书模式；私钥、公钥、证书都支持直接粘贴内容或填写服务器本地文件路径。",
    items: [
      {
        key: "ALIPAY_AUTH_MODE",
        label: "接入方式",
        description: "选择普通公钥模式或证书模式。",
        secret: false,
        inputType: "SELECT",
        options: [
          {
            label: "密钥模式",
            value: "KEY"
          },
          {
            label: "证书模式",
            value: "CERT"
          }
        ]
      },
      {
        key: "ALIPAY_PRODUCT_CAPABILITIES",
        label: "已开通产品",
        description:
          "用于统一收银台在二维码、电脑网站支付、手机网站支付之间做路由和回退；建议按支付宝开放平台实际签约产品勾选。",
        secret: false,
        inputType: "MULTI_SELECT",
        options: [
          {
            label: "当面付二维码",
            value: "QR"
          },
          {
            label: "电脑网站支付",
            value: "PAGE"
          },
          {
            label: "手机网站支付",
            value: "WAP"
          }
        ]
      },
      {
        key: "ALIPAY_APP_ID",
        label: "应用 ID",
        description: "支付宝开放平台分配的应用唯一标识。",
        secret: false,
        inputType: "TEXT"
      },
      {
        key: "ALIPAY_PRIVATE_KEY",
        label: "应用私钥",
        description: "支持直接粘贴 PEM 内容，或填写服务器可访问的密钥文件路径。",
        secret: true,
        inputType: "TEXTAREA",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置"
      },
      {
        key: "ALIPAY_PUBLIC_KEY",
        label: "支付宝公钥",
        description: "用于验签支付宝返回结果；支持 PEM 内容或文件路径。",
        secret: false,
        inputType: "TEXTAREA"
      },
      {
        key: "ALIPAY_APP_CERT",
        label: "应用公钥证书",
        description: "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA"
      },
      {
        key: "ALIPAY_PUBLIC_CERT",
        label: "支付宝公钥证书",
        description: "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA"
      },
      {
        key: "ALIPAY_ROOT_CERT",
        label: "支付宝根证书",
        description: "证书模式下使用；支持直接粘贴 CRT 内容，或填写服务器可访问的证书文件路径。",
        secret: false,
        inputType: "TEXTAREA"
      },
      {
        key: "ALIPAY_GATEWAY",
        label: "网关地址",
        description: "沙箱和生产地址不同，后台固定提供“沙箱测试”和“正式生产”两个选项。",
        secret: false,
        inputType: "TEXT"
      }
    ]
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
        inputType: "TEXT"
      },
      {
        key: "WECHATPAY_MCH_ID",
        label: "商户号",
        description: "微信支付分配的商户号。",
        secret: false,
        inputType: "TEXT"
      },
      {
        key: "WECHATPAY_API_V3_KEY",
        label: "API v3 密钥",
        description: "微信支付 API v3 证书解密和签名相关密钥。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置"
      },
      {
        key: "WECHATPAY_PRIVATE_KEY",
        label: "商户私钥",
        description: "支持直接粘贴 PEM 内容，或填写服务器可访问的密钥文件路径。",
        secret: true,
        inputType: "TEXTAREA",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置"
      }
    ]
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
        inputType: "TEXT"
      },
      {
        key: "PAYPAL_CLIENT_SECRET",
        label: "Client Secret",
        description: "PayPal 开发者后台生成的客户端密钥。",
        secret: true,
        inputType: "PASSWORD",
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置"
      }
    ]
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
        placeholder: "已配置时不会回显，重新输入会覆盖当前数据库配置"
      }
    ]
  }
];

export type PlatformConfigKey = string;
export type PlatformConfigGroupKey = string;

export const PLATFORM_CONFIG_DEFINITIONS: PlatformConfigItemDefinition[] =
  PLATFORM_CONFIG_GROUPS.flatMap(
    (group) => group.items
  );

export const PLATFORM_CONFIG_KEY_SET = new Set(
  PLATFORM_CONFIG_DEFINITIONS.map((item) => item.key)
);

export const PLATFORM_CONFIG_GROUP_KEY_SET = new Set(
  PLATFORM_CONFIG_GROUPS.map((group) => group.key)
);

export const PLATFORM_CONFIG_DEFINITION_MAP = new Map(
  PLATFORM_CONFIG_DEFINITIONS.map((item) => [item.key, item])
);

export const PLATFORM_CONFIG_GROUP_DEFINITION_MAP = new Map(
  PLATFORM_CONFIG_GROUPS.map((group) => [group.key, group])
);

export const PLATFORM_CONFIG_FIELD_GROUP_MAP = new Map(
  PLATFORM_CONFIG_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.key, group.key] as const)
  )
);

export function isPlatformConfigKey(value: string): boolean {
  return PLATFORM_CONFIG_KEY_SET.has(value);
}

export function isPlatformConfigGroupKey(value: string): boolean {
  return PLATFORM_CONFIG_GROUP_KEY_SET.has(value);
}

export function getPlatformConfigFieldDefinition(
  value: string
): PlatformConfigItemDefinition | undefined {
  return PLATFORM_CONFIG_DEFINITION_MAP.get(value);
}

export function getPlatformConfigGroupDefinition(
  value: string
): PlatformConfigGroupDefinition | undefined {
  return PLATFORM_CONFIG_GROUP_DEFINITION_MAP.get(value);
}

export function getPlatformConfigGroupKeyByFieldKey(
  value: string
): PlatformConfigGroupKey | undefined {
  return PLATFORM_CONFIG_FIELD_GROUP_MAP.get(value);
}
