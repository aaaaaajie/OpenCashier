import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  X509Certificate,
  type KeyObject
} from "node:crypto";

interface WechatPayClientConfigBase {
  appId: string;
  mchId: string;
  mchSerialNo: string;
  apiV3Key: string;
  privateKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface WechatPayPublicKeyVerifierConfig extends WechatPayClientConfigBase {
  verifyMode?: "PUBLIC_KEY";
  wechatPayPublicKey: string;
  wechatPayPublicKeyId?: string;
}

export interface WechatPayPlatformCertVerifierConfig
  extends WechatPayClientConfigBase {
  verifyMode?: "CERT";
  wechatPayPlatformCert: string;
  wechatPayPlatformCertSerialNo?: string;
}

export type WechatPayClientConfig =
  | WechatPayPublicKeyVerifierConfig
  | WechatPayPlatformCertVerifierConfig;

export interface WechatPayAmount {
  total: number;
  currency?: string;
}

export interface WechatPaySceneInfo {
  payer_client_ip?: string;
  device_id?: string;
}

export interface WechatPayNativeTransactionRequest {
  description: string;
  out_trade_no: string;
  notify_url: string;
  time_expire?: string;
  attach?: string;
  amount: WechatPayAmount;
  scene_info?: WechatPaySceneInfo;
}

export interface WechatPayNativeTransactionResponse {
  code_url: string;
}

export interface WechatPayJsapiPayer {
  openid: string;
}

export interface WechatPayJsapiTransactionRequest
  extends Omit<WechatPayNativeTransactionRequest, "scene_info"> {
  payer: WechatPayJsapiPayer;
  scene_info?: WechatPaySceneInfo;
}

export interface WechatPayJsapiTransactionResponse {
  prepay_id: string;
}

export interface WechatPayTransactionAmount {
  total: number;
  payer_total?: number;
  currency?: string;
  payer_currency?: string;
}

export interface WechatPayTransactionQueryResponse {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id?: string;
  trade_type?: string;
  trade_state: string;
  trade_state_desc: string;
  bank_type?: string;
  attach?: string;
  success_time?: string;
  payer?: {
    openid?: string;
  };
  amount?: WechatPayTransactionAmount;
}

export interface WechatPayRefundRequest {
  transaction_id?: string;
  out_trade_no?: string;
  out_refund_no: string;
  reason?: string;
  notify_url?: string;
  amount: {
    refund: number;
    total: number;
    currency?: string;
  };
}

export interface WechatPayRefundAmount {
  total: number;
  refund: number;
  payer_total?: number;
  payer_refund?: number;
  settlement_refund?: number;
  settlement_total?: number;
  discount_refund?: number;
  currency?: string;
  refund_fee?: number;
}

export interface WechatPayRefundResponse {
  refund_id: string;
  out_refund_no: string;
  transaction_id: string;
  out_trade_no: string;
  channel: string;
  user_received_account: string;
  success_time?: string;
  create_time?: string;
  status: string;
  funds_account?: string;
  amount: WechatPayRefundAmount;
}

export interface WechatPayNotificationResourceEnvelope {
  original_type: string;
  algorithm: "AEAD_AES_256_GCM";
  ciphertext: string;
  associated_data?: string;
  nonce: string;
}

export interface WechatPayNotificationEnvelope {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  summary: string;
  resource: WechatPayNotificationResourceEnvelope;
}

export interface WechatPayPaymentNotificationResource {
  mchid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type?: string;
  trade_state: string;
  trade_state_desc?: string;
  bank_type?: string;
  attach?: string;
  success_time?: string;
  payer?: {
    openid?: string;
  };
  amount?: WechatPayTransactionAmount;
}

export interface WechatPayRefundNotificationResource {
  mchid: string;
  out_trade_no: string;
  transaction_id: string;
  out_refund_no: string;
  refund_id: string;
  refund_status: string;
  success_time?: string;
  user_received_account?: string;
  amount?: WechatPayRefundAmount;
}

export interface WechatPayNotificationResult<T> {
  notification: WechatPayNotificationEnvelope;
  resource: T;
  resourceText: string;
}

export interface WechatPayJsapiPayParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
}

export class WechatPayApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly detail?: unknown;
  readonly headers: Record<string, string>;
  readonly body: string;

  constructor(input: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    code?: string;
    message?: string;
    detail?: unknown;
  }) {
    super(
      input.message ??
        input.code ??
        `wechatpay api request failed with status ${input.statusCode}`
    );
    this.name = "WechatPayApiError";
    this.statusCode = input.statusCode;
    this.code = input.code;
    this.detail = input.detail;
    this.headers = input.headers;
    this.body = input.body;
  }

  static fromResponse(input: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }): WechatPayApiError {
    const parsed = parseJson<Record<string, unknown>>(input.body);

    return new WechatPayApiError({
      statusCode: input.statusCode,
      body: input.body,
      headers: input.headers,
      code: asOptionalString(parsed?.code),
      message: asOptionalString(parsed?.message),
      detail: parsed?.detail
    });
  }
}

export class WechatPaySignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatPaySignatureError";
  }
}

export class WechatPayClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly privateKey: KeyObject;
  private readonly verifierKey: KeyObject;
  private readonly verifierSerial?: string;
  private readonly apiV3Key: Buffer;

  constructor(private readonly config: WechatPayClientConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.mch.weixin.qq.com").replace(
      /\/$/,
      ""
    );
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.privateKey = createPrivateKey(normalizePem(config.privateKey));
    this.apiV3Key = Buffer.from(config.apiV3Key, "utf8");

    const verifier = this.resolveVerifier(config);
    this.verifierKey = verifier.key;
    this.verifierSerial = verifier.serial;

    if (this.apiV3Key.length !== 32) {
      throw new Error("WECHATPAY_API_V3_KEY must be exactly 32 bytes");
    }
  }

  async createNativeTransaction(
    input: WechatPayNativeTransactionRequest
  ): Promise<WechatPayNativeTransactionResponse> {
    return this.requestJson("POST", "/v3/pay/transactions/native", input);
  }

  async createJsapiTransaction(
    input: WechatPayJsapiTransactionRequest
  ): Promise<WechatPayJsapiTransactionResponse> {
    return this.requestJson("POST", "/v3/pay/transactions/jsapi", input);
  }

  async queryTransactionByOutTradeNo(
    outTradeNo: string
  ): Promise<WechatPayTransactionQueryResponse> {
    return this.requestJson(
      "GET",
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}`,
      undefined,
      { mchid: this.config.mchId }
    );
  }

  async closeTransactionByOutTradeNo(outTradeNo: string): Promise<void> {
    await this.requestVoid(
      "POST",
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`,
      { mchid: this.config.mchId }
    );
  }

  async createRefund(input: WechatPayRefundRequest): Promise<WechatPayRefundResponse> {
    return this.requestJson("POST", "/v3/refund/domestic/refunds", input);
  }

  async queryRefundByOutRefundNo(
    outRefundNo: string
  ): Promise<WechatPayRefundResponse> {
    return this.requestJson(
      "GET",
      `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`
    );
  }

  buildJsapiPayParams(
    prepayId: string,
    input?: {
      appId?: string;
      nonceStr?: string;
      timestamp?: number;
    }
  ): WechatPayJsapiPayParams {
    const appId = input?.appId ?? this.config.appId;
    const timeStamp = String(input?.timestamp ?? Math.floor(Date.now() / 1000));
    const nonceStr = input?.nonceStr ?? createNonce();
    const packageValue = `prepay_id=${prepayId}`;
    const message = [appId, timeStamp, nonceStr, packageValue, ""].join("\n");

    return {
      appId,
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA",
      paySign: this.sign(message)
    };
  }

  verifyAndDecryptNotification<T>(input: {
    headers: HeadersLike;
    body: string;
  }): WechatPayNotificationResult<T> {
    const rawBody = input.body ?? "";
    const headers = normalizeHeaders(input.headers);
    const timestamp = this.getRequiredHeader(headers, "wechatpay-timestamp");
    const nonce = this.getRequiredHeader(headers, "wechatpay-nonce");
    const signature = this.getRequiredHeader(headers, "wechatpay-signature");
    const serial = this.getRequiredHeader(headers, "wechatpay-serial");

    if (signature.startsWith("WECHATPAY/SIGNTEST/")) {
      throw new WechatPaySignatureError("wechatpay sign probe request detected");
    }

    this.assertVerifierSerial(serial);
    this.verifySignature(`${timestamp}\n${nonce}\n${rawBody}\n`, signature);

    const notification = parseJson<WechatPayNotificationEnvelope>(rawBody);

    if (!notification) {
      throw new Error("invalid wechatpay notification body");
    }

    const resourceText = decryptNotificationResource(
      this.apiV3Key,
      notification.resource
    );
    const resource = parseJson<T>(resourceText);

    if (!resource) {
      throw new Error("invalid wechatpay notification resource");
    }

    return {
      notification,
      resource,
      resourceText
    };
  }

  private async requestJson<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const response = await this.request(method, path, body, query);

    if (!response.bodyText) {
      throw new Error("wechatpay response body is empty");
    }

    const payload = parseJson<T>(response.bodyText);

    if (!payload) {
      throw new Error("wechatpay response body is not valid json");
    }

    return payload;
  }

  private async requestVoid(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<void> {
    await this.request(method, path, body, query);
  }

  private async request(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<{ bodyText: string; headers: Record<string, string> }> {
    const canonicalUrl = buildCanonicalUrl(path, query);
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = createNonce();
    const message = `${method}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${bodyText}\n`;
    const authorization =
      'WECHATPAY2-SHA256-RSA2048 ' +
      [
        `mchid="${this.config.mchId}"`,
        `nonce_str="${nonce}"`,
        `signature="${this.sign(message)}"`,
        `timestamp="${timestamp}"`,
        `serial_no="${this.config.mchSerialNo}"`
      ].join(",");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${canonicalUrl}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          Authorization: authorization
        },
        body: body === undefined ? undefined : bodyText,
        signal: controller.signal
      });
      const responseHeaders = headersToObject(response.headers);
      const responseBodyText = await response.text();

      this.verifyResponseSignatureIfPresent(responseHeaders, responseBodyText);

      if (!response.ok) {
        throw WechatPayApiError.fromResponse({
          statusCode: response.status,
          body: responseBodyText,
          headers: responseHeaders
        });
      }

      return {
        bodyText: responseBodyText,
        headers: responseHeaders
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private verifyResponseSignatureIfPresent(
    headers: Record<string, string>,
    bodyText: string
  ): void {
    const timestamp = headers["wechatpay-timestamp"];
    const nonce = headers["wechatpay-nonce"];
    const signature = headers["wechatpay-signature"];
    const serial = headers["wechatpay-serial"];

    if (!timestamp || !nonce || !signature || !serial) {
      return;
    }

    this.assertVerifierSerial(serial);
    this.verifySignature(`${timestamp}\n${nonce}\n${bodyText}\n`, signature);
  }

  private assertVerifierSerial(serial: string): void {
    if (this.verifierSerial && serial !== this.verifierSerial) {
      throw new WechatPaySignatureError(
        `wechatpay serial mismatch: expected ${this.verifierSerial}, got ${serial}`
      );
    }
  }

  private verifySignature(message: string, signatureBase64: string): void {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(message);
    verifier.end();

    const verified = verifier.verify(
      this.verifierKey,
      Buffer.from(signatureBase64, "base64")
    );

    if (!verified) {
      throw new WechatPaySignatureError("invalid wechatpay signature");
    }
  }

  private sign(message: string): string {
    const signer = createSign("RSA-SHA256");
    signer.update(message);
    signer.end();

    return signer.sign(this.privateKey, "base64");
  }

  private getRequiredHeader(
    headers: Record<string, string>,
    key: string
  ): string {
    const value = headers[key];

    if (!value) {
      throw new WechatPaySignatureError(`missing wechatpay header: ${key}`);
    }

    return value;
  }

  private resolveVerifier(
    config: WechatPayClientConfig
  ): { key: KeyObject; serial?: string } {
    if ("wechatPayPlatformCert" in config) {
      const certificate = new X509Certificate(
        normalizePem(config.wechatPayPlatformCert)
      );

      return {
        key: certificate.publicKey,
        serial: config.wechatPayPlatformCertSerialNo
      };
    }

    if ("wechatPayPublicKey" in config) {
      return {
        key: createPublicKey(normalizePem(config.wechatPayPublicKey)),
        serial: config.wechatPayPublicKeyId
      };
    }

    throw new Error("missing wechatpay verifier configuration");
  }
}

type HttpMethod = "GET" | "POST";
type HeadersLike = Headers | Record<string, string | string[] | undefined>;

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function createNonce(): string {
  return randomBytes(16).toString("hex");
}

function buildCanonicalUrl(
  path: string,
  query?: Record<string, string>
): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const search = new URLSearchParams(query).toString();
  return `${path}?${search}`;
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

function normalizeHeaders(input: HeadersLike): Record<string, string> {
  if (input instanceof Headers) {
    return headersToObject(input);
  }

  return Object.entries(input).reduce<Record<string, string>>((result, [key, value]) => {
    if (Array.isArray(value)) {
      result[key.toLowerCase()] = value[0] ?? "";
      return result;
    }

    if (typeof value === "string") {
      result[key.toLowerCase()] = value;
    }

    return result;
  }, {});
}

function decryptNotificationResource(
  apiV3Key: Buffer,
  resource: WechatPayNotificationResourceEnvelope
): string {
  const ciphertext = Buffer.from(resource.ciphertext, "base64");

  if (ciphertext.length < 17) {
    throw new Error("invalid wechatpay notification ciphertext");
  }

  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    apiV3Key,
    Buffer.from(resource.nonce, "utf8")
  );

  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data ?? "", "utf8"));

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
}

function parseJson<T>(value: string): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
