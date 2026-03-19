import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
import { OpenCashierApiError, OpenCashierClient } from "./opencashier-client";
import { verifyPlatformNotify } from "./notify-verify";
import { QuickstartStore } from "./store";

// main.ts initializes these once before the HTTP server starts.
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

export function startServer(nextConfig: QuickstartConfig): void {
  config = nextConfig;
  store = new QuickstartStore();
  opencashier = new OpenCashierClient({
    apiBaseUrl: config.apiBaseUrl,
    appId: config.appId,
    appSecret: config.appSecret
  });

  server.listen(config.port, () => {
    console.log(`merchant-quickstart running at ${config.appBaseUrl}`);
    console.log(`OpenCashier API: ${config.apiBaseUrl}`);
    console.log(`Notify URL: ${config.notifyUrl}`);
  });
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
    const created = await opencashier.createOrder(createOrderInput);

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
    const queriedOrder = await opencashier.getOrderByMerchantOrderNo(merchantOrderNo);
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
    !verifyPlatformNotify({
      headers: request.headers,
      rawBody,
      appSecret: config.appSecret
    })
  ) {
    response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("invalid signature");
    return;
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    store.recordNotify({
      notifyId:
        typeof payload.notifyId === "string" ? payload.notifyId : undefined,
      eventType:
        typeof payload.eventType === "string" ? payload.eventType : undefined,
      platformOrderNo:
        typeof payload.platformOrderNo === "string"
          ? payload.platformOrderNo
          : undefined,
      merchantOrderNo:
        typeof payload.merchantOrderNo === "string"
          ? payload.merchantOrderNo
          : undefined,
      status: typeof payload.status === "string" ? payload.status : undefined,
      channel: typeof payload.channel === "string" ? payload.channel : undefined,
      paidTime:
        typeof payload.paidTime === "string" ? payload.paidTime : undefined,
      amount: typeof payload.amount === "number" ? payload.amount : undefined,
      paidAmount:
        typeof payload.paidAmount === "number" ? payload.paidAmount : undefined,
      currency:
        typeof payload.currency === "string" ? payload.currency : undefined
    });
  } catch {
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
