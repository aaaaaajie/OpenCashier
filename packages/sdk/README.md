# @opencashier/sdk

Official Node.js / TypeScript SDK for the OpenCashier Merchant API.

## Requirements

- Node.js 18+

## Install

```bash
npm install @opencashier/sdk
```

```bash
pnpm add @opencashier/sdk
```

`baseUrl` must point to the Merchant API root such as `https://pay.example.com/api/v1`.

## Initialize A Client

```ts
import { OpenCashierClient } from "@opencashier/sdk";

const client = new OpenCashierClient({
  baseUrl: process.env.OPENCASHIER_BASE_URL!,
  merchant: {
    appId: process.env.OPENCASHIER_APP_ID!,
    appSecret: process.env.OPENCASHIER_APP_SECRET!
  }
});
```

## Create An Order

```ts
const order = await client.orders.create({
  merchantOrderNo: "ORDER_202603190001",
  amount: 100,
  currency: "CNY",
  subject: "Test order",
  description: "OpenCashier SDK example",
  notifyUrl: "https://merchant.example.com/pay/notify",
  returnUrl: "https://merchant.example.com/pay/result",
  allowedChannels: ["alipay_page"]
});

console.log(order.platformOrderNo);
console.log(order.cashierUrl);
```

The SDK signs merchant requests, injects standard OpenCashier headers, and applies a default idempotency key for write APIs.

## Verify Merchant Notifications

Keep the raw request body string and verify it before handling business logic:

```ts
const payload = client.notifications.verify<{
  notifyId?: string;
  eventType?: string;
  platformOrderNo?: string;
  merchantOrderNo?: string;
  status?: string;
}>({
  headers: request.headers,
  rawBody
});
```

After successful processing, your endpoint should return plain text `success`.

## Optional Provider Setup

If you also want to write app-scoped provider config from the same SDK, add admin credentials and call `client.providers.setup()`:

```ts
const client = new OpenCashierClient({
  baseUrl: process.env.OPENCASHIER_BASE_URL!,
  merchant: {
    appId: process.env.OPENCASHIER_APP_ID!,
    appSecret: process.env.OPENCASHIER_APP_SECRET!
  },
  admin: {
    username: process.env.OPENCASHIER_ADMIN_USERNAME!,
    password: process.env.OPENCASHIER_ADMIN_PASSWORD!
  }
});

await client.providers.setup({
  alipay: {
    authMode: "KEY",
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_PRIVATE_KEY!,
    publicKey: process.env.ALIPAY_PUBLIC_KEY!,
    gateway: process.env.ALIPAY_GATEWAY!,
    productCapabilities: ["PAGE"]
  }
});
```

## Errors

```ts
import { OpenCashierApiError } from "@opencashier/sdk";

try {
  await client.orders.create({
    merchantOrderNo: "ORDER_202603190001",
    amount: 100,
    currency: "CNY",
    subject: "Test order",
    notifyUrl: "https://merchant.example.com/pay/notify"
  });
} catch (error) {
  if (error instanceof OpenCashierApiError) {
    console.error(error.status, error.code, error.requestId, error.message);
  }
}
```

## Documentation

- English guide: <https://opencashier-docs.vercel.app/en/node-sdk>
- Chinese guide: <https://opencashier-docs.vercel.app/zh-CN/node-sdk>
