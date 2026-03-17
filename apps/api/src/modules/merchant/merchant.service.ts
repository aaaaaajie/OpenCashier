import {
  BadRequestException,
  ConflictException,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus, SignType } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminAuthService } from "../auth/admin-auth.service";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { CreateMerchantAppDto } from "./dto/create-merchant-app.dto";

type MerchantChannelGuide = {
  channel: string;
  label: string;
  providerCode: string;
  providerName: string;
  recommendedFor: string;
  description: string;
};

const CHANNEL_GUIDE_MAP: Record<
  string,
  Omit<MerchantChannelGuide, "channel" | "providerCode" | "providerName">
> = {
  alipay_qr: {
    label: "支付宝扫码",
    recommendedFor: "用户在电脑端打开支付页，用支付宝扫码完成支付",
    description: "常用于 PC 收银台或线下扫码支付。"
  },
  alipay_page: {
    label: "支付宝电脑网站支付",
    recommendedFor: "PC 浏览器直接跳转支付宝完成支付",
    description: "适合桌面浏览器网页支付。"
  },
  alipay_wap: {
    label: "支付宝手机网站支付",
    recommendedFor: "移动浏览器直接拉起支付宝或支付宝 H5 支付页",
    description: "适合手机浏览器支付。"
  },
  wechat_qr: {
    label: "微信扫码",
    recommendedFor: "用户通过微信扫码完成支付",
    description: "适合 PC 收银台展示二维码。"
  },
  wechat_jsapi: {
    label: "微信 JSAPI",
    recommendedFor: "微信公众号或微信内 WebView 支付",
    description: "仅适合微信内环境。"
  },
  stripe_checkout: {
    label: "Stripe Checkout",
    recommendedFor: "国际卡支付或海外收单，直接跳转 Stripe Hosted Checkout",
    description: "当前平台会直接跳转 Stripe Checkout。"
  },
  paypal_checkout: {
    label: "PayPal Checkout",
    recommendedFor: "海外 PayPal 支付场景",
    description: "当前渠道编码已预留，真实交易链路暂未开放。"
  }
};

const CHANNEL_PRESETS = [
  {
    key: "alipay",
    label: "支付宝",
    description: "根据终端在扫码、电脑网站和手机网站支付之间自动选择。",
    channels: ["alipay_qr", "alipay_page", "alipay_wap"]
  },
  {
    key: "wechat",
    label: "微信支付",
    description: "根据终端和场景在扫码与 JSAPI 之间选择。",
    channels: ["wechat_qr", "wechat_jsapi"]
  },
  {
    key: "stripe",
    label: "Stripe",
    description: "直接跳转 Stripe Hosted Checkout。",
    channels: ["stripe_checkout"]
  },
  {
    key: "paypal",
    label: "PayPal",
    description: "PayPal 预留接入位，当前尚未开放真实交易。",
    channels: ["paypal_checkout"]
  }
] as const;

const NEWBIE_FAQ = [
  {
    question: "部署到公网后，任何人都能改后台配置吗？",
    answer:
      "不会。管理后台 API 现在默认要求管理员认证；只有 /api/cashier/* 和商户自己的签名 API 是对外开放的。"
  },
  {
    question: "商户从哪里拿 appId 和 appSecret？",
    answer:
      "在后台“商户应用”页创建，或调用管理员 API 创建；密钥会在创建成功后返回一次，商户需要自行保存。"
  },
  {
    question: "allowedChannels 到底应该传什么？",
    answer:
      "它表达的是“这笔订单允许平台在什么支付范围内完成支付”，不是前端按钮列表。优先按支付品牌选预设，如支付宝传 alipay_qr/alipay_page/alipay_wap。"
  },
  {
    question: "Idempotency-Key 要怎么生成？",
    answer:
      "建议把业务主键和动作名拼进去，例如 order:{merchantOrderNo}:create、order:{platformOrderNo}:close、refund:{merchantRefundNo}:create。"
  },
  {
    question: "平台 API 根地址去哪看？",
    answer:
      "后台“商户应用”页会直接显示 merchant API 根地址和 Swagger 地址；部署层面就是 APP_BASE_URL + /api/v1。"
  },
  {
    question: "notifyUrl 返回什么才算成功？",
    answer: "必须返回 HTTP 2xx，且响应体是纯文本 success。否则平台会进入重试队列。"
  },
  {
    question: "我应该保存 platformOrderNo 还是 cashierUrl？",
    answer:
      "两个都保存。platformOrderNo 用于查单和退款，cashierUrl 用于把用户带到支付入口。"
  },
  {
    question: "收银台页面需要自己部署吗？",
    answer:
      "不需要。大多数场景直接把前端跳转到平台返回的 cashierUrl 就可以。只有要自定义 UI 时才需要用 cashierToken 拉会话。"
  }
] as const;

@Injectable()
export class MerchantService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly adminAuthService: AdminAuthService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService
  ) {}

  async listMerchantApps() {
    const merchantApps = await this.prismaService.merchantApp.findMany({
      include: { merchant: true },
      orderBy: { createdAt: "desc" }
    });

    return merchantApps.map((app) => ({
      appId: app.appId,
      appName: app.appName,
      merchantName: app.merchant.merchantName,
      status: app.status,
      signType: this.toApiSignType(app.signType),
      allowedChannels: app.allowedChannels,
      hasSecretConfigured: Boolean(app.secretCiphertext),
      createdAt: app.createdAt.toISOString()
    }));
  }

  getMerchantOnboarding() {
    const appBaseUrl = this.getAppBaseUrl();
    const merchantApiBaseUrl = `${appBaseUrl}/api/v1`;
    const swaggerUrl = `${appBaseUrl}/api/docs`;
    const hostedCashierEntryUrl = `${appBaseUrl}/api/cashier/{cashierToken}`;
    const catalog = this.paymentChannelRegistryService.listCatalog();

    const channelGuides: MerchantChannelGuide[] = catalog.flatMap((provider) =>
      provider.supportedChannels.map((channel) => ({
        channel,
        providerCode: provider.providerCode,
        providerName: provider.displayName,
        ...(CHANNEL_GUIDE_MAP[channel] ?? {
          label: channel,
          recommendedFor: "按业务场景决定是否开放该渠道。",
          description: provider.note
        })
      }))
    );

    return {
      adminAuthEnabled: this.adminAuthService.isEnabled(),
      merchantApiBaseUrl,
      swaggerUrl,
      hostedCashierEntryUrl,
      createMerchantAppApiPath: "/api/v1/admin/merchants",
      idempotencyKeySuggestions: {
        createOrder: "order:{merchantOrderNo}:create",
        closeOrder: "order:{platformOrderNo}:close",
        createRefund: "refund:{merchantRefundNo}:create"
      },
      channelPresets: CHANNEL_PRESETS,
      channelGuides,
      newbieFaq: NEWBIE_FAQ
    };
  }

  async createMerchantApp(input: CreateMerchantAppDto) {
    const merchantName = input.merchantName.trim();
    const appName = input.appName.trim();
    const allowedChannels = this.normalizeAllowedChannels(input.allowedChannels);
    const appId = input.appId?.trim() || this.generateAppId();
    const appSecret = input.appSecret?.trim() || this.generateAppSecret();

    if (!merchantName || !appName) {
      throw new BadRequestException("merchantName and appName are required");
    }

    if (appSecret.length < 16) {
      throw new BadRequestException("appSecret must be at least 16 characters");
    }

    this.paymentChannelRegistryService.validateChannels(allowedChannels);

    const merchant = await this.findOrCreateMerchant(merchantName);

    try {
      const created = await this.prismaService.merchantApp.create({
        data: {
          merchantId: merchant.id,
          appId,
          appName,
          status: MerchantStatus.ACTIVE,
          signType: SignType.HMAC_SHA256,
          allowedChannels,
          secretCiphertext: appSecret
        }
      });

      return {
        merchantName,
        appName: created.appName,
        appId: created.appId,
        appSecret,
        status: created.status,
        signType: this.toApiSignType(created.signType),
        allowedChannels: created.allowedChannels,
        merchantApiBaseUrl: `${this.getAppBaseUrl()}/api/v1`,
        swaggerUrl: `${this.getAppBaseUrl()}/api/docs`
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: "APP_ID_CONFLICT",
          message: `appId already exists: ${appId}`
        });
      }

      throw error;
    }
  }

  private async findOrCreateMerchant(merchantName: string) {
    const existing = await this.prismaService.merchant.findFirst({
      where: { merchantName },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return existing;
    }

    return this.prismaService.merchant.create({
      data: {
        merchantNo: this.generateMerchantNo(),
        merchantName,
        status: MerchantStatus.ACTIVE
      }
    });
  }

  private normalizeAllowedChannels(channels: string[]): string[] {
    const normalized = Array.from(
      new Set(
        (channels ?? [])
          .map((channel) => channel.trim())
          .filter((channel) => channel.length > 0)
      )
    );

    if (normalized.length === 0) {
      throw new BadRequestException("allowedChannels must contain at least one item");
    }

    return normalized;
  }

  private generateMerchantNo(): string {
    return `M${Date.now()}${randomBytes(2).toString("hex").toUpperCase()}`;
  }

  private generateAppId(): string {
    return `app_${randomBytes(5).toString("hex")}`;
  }

  private generateAppSecret(): string {
    return `ocs_${randomBytes(24).toString("base64url")}`;
  }

  private getAppBaseUrl(): string {
    return (
      this.configService.get<string>("APP_BASE_URL")?.trim().replace(/\/$/, "") ||
      "http://localhost:3000"
    );
  }

  private toApiSignType(signType: SignType): "HMAC-SHA256" | "RSA2" {
    return signType === SignType.HMAC_SHA256 ? "HMAC-SHA256" : "RSA2";
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
