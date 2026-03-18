# Merchant Quickstart

[中文说明](./README.zh-CN.md)

This is a minimal merchant-side integration reference for OpenCashier.

It covers the core merchant flow:

- sign merchant requests
- create an order and receive `cashierUrl`
- redirect the browser to the hosted cashier
- verify async notifications from OpenCashier
- query order status on the result page as a fallback

It does not include refunds or a custom cashier UI.

## Prerequisites

Before starting, configure `.env`. Default values:

- `PORT=4100`
- `APP_BASE_URL=http://127.0.0.1:4100`
- `OPENCASHIER_API_BASE_URL=http://127.0.0.1:3000/api/v1`
- `OPENCASHIER_APP_ID=demo_app`
- `OPENCASHIER_APP_SECRET=demo_app_secret`
- `OPENCASHIER_NOTIFY_URL` defaults to `${APP_BASE_URL}/notify/opencashier`
- `OPENCASHIER_ALLOWED_CHANNELS=alipay_page`
  Maps to create-order `allowedChannels`. See [allowedChannels reference](https://opencashier-docs.vercel.app/en/merchant-api-integration#24-allowedchannels-reference).
- `ENABLE_DEMO_DATA=1`

## Run

```bash
pnpm install
pnpm dev:api
pnpm dev:merchant-quickstart
```

Then open [http://127.0.0.1:4100](http://127.0.0.1:4100).

To complete a real payment and notification loop, configure at least one working payment channel in OpenCashier first.

## Files

- `src/config.ts`
- `src/server.ts`
- `src/opencashier-client.ts`
- `src/signing.ts`
- `src/notify-verify.ts`
- `src/store.ts`
