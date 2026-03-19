import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ValidatePlatformConfigDto } from "../admin/dto/validate-platform-config.dto";
import { UpsertPlatformConfigDto } from "../admin/dto/upsert-platform-config.dto";
import { PaymentChannelRegistryService } from "../payment/channels/payment-channel-registry.service";
import { PaymentProviderCode } from "../payment/channels/payment-channel.types";
import { PlatformConfigService } from "../payment/platform-config.service";

@Injectable()
export class MerchantPlatformConfigService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly paymentChannelRegistryService: PaymentChannelRegistryService
  ) {}

  async listMerchantPlatformConfigs(appId: string) {
    await this.assertMerchantAppExists(appId);
    return this.platformConfigService.listConfigs(appId);
  }

  async upsertMerchantPlatformConfigs(
    appId: string,
    body: UpsertPlatformConfigDto
  ) {
    await this.assertMerchantAppExists(appId);
    return this.platformConfigService.upsertConfig({
      ...body,
      appId
    });
  }

  async activateMerchantPlatformConfig(appId: string, configKey: string) {
    await this.assertMerchantAppExists(appId);
    return this.platformConfigService.activateConfig(configKey, { appId });
  }

  async clearMerchantPlatformConfig(appId: string, configKey: string) {
    await this.assertMerchantAppExists(appId);
    return this.platformConfigService.clearConfig(configKey, { appId });
  }

  async validateMerchantPlatformConfig(
    appId: string,
    configKey: string,
    body?: ValidatePlatformConfigDto
  ) {
    await this.assertMerchantAppExists(appId);
    const providerCode = PROVIDER_CONFIG_GROUP_TO_CODE[configKey];

    if (!providerCode) {
      return {
        configKey,
        appId,
        status: "UNSUPPORTED" as const,
        message: "当前配置组暂不支持在线验证。",
        checkedAt: new Date().toISOString()
      };
    }

    const result =
      body?.value !== undefined
        ? await this.platformConfigService.runWithPreview(
            configKey,
            body.value,
            () =>
              this.paymentChannelRegistryService.validateProviderConfig(providerCode, {
                appId
              }),
            { appId }
          )
        : await this.paymentChannelRegistryService.validateProviderConfig(
            providerCode,
            { appId }
          );

    return {
      configKey,
      appId,
      ...result
    };
  }

  private async assertMerchantAppExists(appId: string): Promise<void> {
    const normalizedAppId = appId.trim();

    if (!normalizedAppId) {
      throw new BadRequestException("appId is required");
    }

    const merchantApp = await this.prismaService.merchantApp.findUnique({
      where: { appId: normalizedAppId },
      select: { appId: true }
    });

    if (!merchantApp) {
      throw new NotFoundException({
        code: "MERCHANT_APP_NOT_FOUND",
        message: `Merchant app not found: ${normalizedAppId}`
      });
    }
  }
}

const PROVIDER_CONFIG_GROUP_TO_CODE: Partial<Record<string, PaymentProviderCode>> = {
  alipay: "ALIPAY",
  wechatpay: "WECHAT_PAY",
  paypal: "PAYPAL",
  stripe: "STRIPE"
};
