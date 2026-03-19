import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { ChannelProviderConfigService } from "../channel-provider-config.service";

const STRIPE_API_VERSION = "2026-02-25.clover";

@Injectable()
export class StripeClientService {
  private client?: Stripe;
  private clientCacheKey?: string;

  constructor(
    private readonly channelProviderConfigService: ChannelProviderConfigService
  ) {}

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey?: string
  ): Promise<Stripe.Checkout.Session> {
    const client = this.getClient();

    return client.checkout.sessions.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  async retrieveCheckoutSession(
    sessionId: string,
    params?: Stripe.Checkout.SessionRetrieveParams
  ): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.retrieve(sessionId, params);
  }

  async expireCheckoutSession(
    sessionId: string
  ): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.expire(sessionId);
  }

  async retrievePaymentIntent(
    paymentIntentId: string
  ): Promise<Stripe.PaymentIntent> {
    return this.getClient().paymentIntents.retrieve(paymentIntentId);
  }

  async createRefund(
    params: Stripe.RefundCreateParams,
    idempotencyKey?: string
  ): Promise<Stripe.Refund> {
    return this.getClient().refunds.create(
      params,
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  constructWebhookEvent(input: {
    body: string;
    signature: string;
    appId?: string;
  }): Stripe.Event {
    const scopedConfig = input.appId
      ? this.channelProviderConfigService.getStripeClientConfig()
      : undefined;
    const candidateConfigs = scopedConfig
      ? [scopedConfig]
      : this.channelProviderConfigService.listStripeClientConfigs();

    let lastError: unknown;

    for (const candidate of candidateConfigs) {
      try {
        return this.getClientBySecretKey(candidate.secretKey).webhooks.constructEvent(
          input.body,
          input.signature,
          candidate.webhookSecret
        );
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    return this.getClient().webhooks.constructEvent(
      input.body,
      input.signature,
      this.channelProviderConfigService.getStripeClientConfig().webhookSecret
    );
  }

  async validateCredentials(): Promise<Stripe.Balance> {
    return this.getClient().balance.retrieve();
  }

  private getClient(): Stripe {
    const clientConfig = this.channelProviderConfigService.getStripeClientConfig();
    return this.getClientBySecretKey(clientConfig.secretKey);
  }

  private getClientBySecretKey(secretKey: string): Stripe {
    const cacheKey = createHash("sha256")
      .update(secretKey)
      .digest("hex");

    if (!this.client || this.clientCacheKey !== cacheKey) {
      this.clientCacheKey = cacheKey;
      this.client = new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 2,
        typescript: true
      });
    }

    return this.client;
  }
}
