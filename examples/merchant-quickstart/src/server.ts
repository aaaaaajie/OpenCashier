import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  OpenCashierApiError,
  OpenCashierClient,
  OpenCashierSignatureError,
  type OpenCashierProviderSetupResult
} from "@opencashier/sdk";
import {
  renderCreateOrderFailedPage,
  renderHomePage,
  renderMissingOrderPage,
  renderNotFoundPage,
  renderOrdersPage,
  renderQuickstartErrorPage,
  renderResultPage
} from "./client";
import { type QuickstartConfig } from "./config";
import { QuickstartStore } from "./store";

let config!: QuickstartConfig;
let store!: QuickstartStore;
let opencashier!: OpenCashierClient;

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    console.error(error);
    sendHtml(response, 500, renderQuickstartErrorPage(formatError(error)));
  }
});

export async function startServer(nextConfig: QuickstartConfig): Promise<void> {
  config = nextConfig;
  store = new QuickstartStore();
  opencashier = new OpenCashierClient({
    baseUrl: config.apiBaseUrl,
    appId: config.appId,
    appSecret: config.appSecret,
    ...(config.adminUsername && config.adminPassword
      ? {
          admin: {
            username: config.adminUsername,
            password: config.adminPassword
          }
        }
      : {})
  });

  await setupProviderConfig();

  server.listen(config.port, () => {
    console.log(`merchant-quickstart running at ${config.appBaseUrl}`);
    console.log(`OpenCashier API: ${config.apiBaseUrl}`);
    console.log(`Notify URL: ${config.notifyUrl}`);
  });
}

async function setupProviderConfig(): Promise<void> {
  if (!config.providerSetup.enabled) {
    console.log(
      "Provider bootstrap skipped because OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=0."
    );
    return;
  }

  if (!config.adminUsername || !config.adminPassword) {
    throw new Error(
      "Missing OPENCASHIER_ADMIN_USERNAME or OPENCASHIER_ADMIN_PASSWORD for admin API bootstrap."
    );
  }

  const result = await opencashier.providers.setupProvider(
    config.providerSetup.group,
    config.providerSetup.config,
    {
      appId: config.appId,
      tolerateValidationFailure: true
    }
  );
  const sourceLabel = config.providerSetup.configFile
    ? ` from ${config.providerSetup.configFile}`
    : "";

  console.log(
    `Provider config ready for ${config.appId}/${config.providerSetup.group}${sourceLabel}: ${formatProviderSetupMessage(result)}`
  );
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", config.appBaseUrl);

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, 200, renderHomePage(config, store.list().slice(0, 5)));
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      appBaseUrl: config.appBaseUrl,
      apiBaseUrl: config.apiBaseUrl
    });
    return;
  }

  if (method === "POST" && url.pathname === "/checkout") {
    await handleCheckout(response);
    return;
  }

  if (method === "GET" && url.pathname === "/result") {
    await handleResultPage(response, url.searchParams.get("merchantOrderNo"));
    return;
  }

  if (method === "GET" && url.pathname === "/orders") {
    sendHtml(response, 200, renderOrdersPage(store.list()));
    return;
  }

  if (method === "POST" && url.pathname === "/notify/opencashier") {
    await handleNotify(request, response);
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

async function handleCheckout(response: ServerResponse): Promise<void> {
  const merchantOrderNo = createMerchantOrderNo();
  const returnUrl = `${config.appBaseUrl}/result?merchantOrderNo=${encodeURIComponent(merchantOrderNo)}`;
  const createOrderInput = {
    merchantOrderNo,
    amount: 1,
    currency: "CNY",
    subject: "OpenCashier Quickstart Order",
    description: "Minimal merchant integration reference flow",
    notifyUrl: config.notifyUrl,
    returnUrl,
    expireInSeconds: 900,
    allowedChannels: config.allowedChannels,
    metadata: {
      source: "merchant-quickstart"
    }
  };

  try {
    const created = await opencashier.orders.create(createOrderInput);

    store.recordCreatedOrder({
      merchantOrderNo,
      platformOrderNo: created.platformOrderNo,
      amount: createOrderInput.amount,
      currency: createOrderInput.currency,
      subject: createOrderInput.subject,
      status: created.status,
      cashierUrl: created.cashierUrl,
      notifyUrl: createOrderInput.notifyUrl,
      returnUrl
    });

    redirect(response, created.cashierUrl);
  } catch (error) {
    sendHtml(response, 502, renderCreateOrderFailedPage(formatError(error)));
  }
}

async function handleResultPage(
  response: ServerResponse,
  merchantOrderNo: string | null
): Promise<void> {
  if (!merchantOrderNo) {
    sendHtml(response, 400, renderMissingOrderPage());
    return;
  }

  let queryError: string | null = null;

  try {
    const queriedOrder = await opencashier.orders.getByMerchantOrderNo(
      merchantOrderNo
    );
    store.recordQueryResult(queriedOrder);
  } catch (error) {
    queryError = formatError(error);
  }

  const order = store.get(merchantOrderNo);

  sendHtml(response, 200, renderResultPage(merchantOrderNo, order, queryError));
}

async function handleNotify(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const rawBody = await readRequestBody(request);

  if (
    !rawBody
  ) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("invalid payload");
    return;
  }

  try {
    const payload = opencashier.notifications.verify<{
      notifyId?: string;
      eventType?: string;
      platformOrderNo?: string;
      merchantOrderNo?: string;
      status?: string;
      channel?: string;
      paidTime?: string;
      amount?: number;
      paidAmount?: number;
      currency?: string;
    }>({
      headers: request.headers,
      rawBody
    });

    store.recordNotify({
      notifyId: payload.notifyId,
      eventType: payload.eventType,
      platformOrderNo: payload.platformOrderNo,
      merchantOrderNo: payload.merchantOrderNo,
      status: payload.status,
      channel: payload.channel,
      paidTime: payload.paidTime,
      amount: payload.amount,
      paidAmount: payload.paidAmount,
      currency: payload.currency
    });
  } catch (error) {
    if (error instanceof OpenCashierSignatureError) {
      response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("invalid signature");
      return;
    }

    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("invalid payload");
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("success");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function createMerchantOrderNo(): string {
  return `MQ_${Date.now()}_${randomBytes(2).toString("hex").toUpperCase()}`;
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { Location: location });
  response.end();
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof OpenCashierApiError) {
    const parts = [error.message];

    if (error.code) {
      parts.push(`code=${error.code}`);
    }

    if (error.requestId) {
      parts.push(`requestId=${error.requestId}`);
    }

    return parts.join(" | ");
  }

  return error instanceof Error ? error.message : String(error);
}

function formatProviderSetupMessage(
  result: OpenCashierProviderSetupResult
): string {
  if (result.validationError) {
    return `Validation probe failed, but the draft was activated for local checkout: ${result.validationError}`;
  }

  if (result.validation) {
    return result.validation.message;
  }

  return "Provider config draft saved and activated.";
}
