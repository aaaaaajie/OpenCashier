# Merchant Quickstart

[中文说明](./README.zh-CN.md)

This is a minimal merchant-side integration example.

The default path covers 5 actions:

- use the official Node SDK to sign merchant requests
- create an order and receive `cashierUrl`
- verify merchant notifications from OpenCashier
- query the order again on the result page
- optionally prepare one app-scoped provider config through the same SDK before the server starts

It does not include refunds or a custom cashier UI.

## Prerequisites

1. Prepare the API-side `.env` in the OpenCashier repo root.

```env
ENABLE_DEMO_DATA=1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

2. Copy the quickstart `.env`.

```bash
cp examples/merchant-quickstart/.env.example examples/merchant-quickstart/.env
```

3. Fill provider values in quickstart `.env` or `provider-config.local.json`.

- `.env` keeps the shortest runnable path.
- `provider-config.example.json` is easier for multiline keys or certificates.
- `OPENCASHIER_PROVIDER_GROUP` stays in `.env`; the JSON file only contains provider fields.
- Field meanings, allowed values, and channel mapping live in public docs:
  - [Merchant Quickstart provider config](https://opencashier-docs.vercel.app/en/provider-config-reference#merchant-quickstart)
  - [allowedChannels and provider groups](https://opencashier-docs.vercel.app/en/provider-config-reference#allowedchannels-and-provider-groups)

Default values:

- `OPENCASHIER_APP_ID=demo_app`
- `OPENCASHIER_APP_SECRET=demo_app_secret`
- `OPENCASHIER_ALLOWED_CHANNELS=alipay_page`
- `OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=1`
- `OPENCASHIER_PROVIDER_GROUP=alipay`

Notes:

- `demo_app` is created by `ENABLE_DEMO_DATA=1`.
- `OPENCASHIER_ADMIN_USERNAME` and `OPENCASHIER_ADMIN_PASSWORD` must match `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the API root `.env`.
- The default example prepares provider config for `demo_app` before the server starts, so you do not need the web admin UI just to make the first checkout work.

## Run

```bash
pnpm install
pnpm dev:api
pnpm dev:merchant-quickstart
```

Open [http://127.0.0.1:4100](http://127.0.0.1:4100).

Before the HTTP server starts, `pnpm dev:merchant-quickstart` calls:

- `PUT /api/v1/admin/merchants/:appId/platform-configs`
- `POST /api/v1/admin/merchants/:appId/platform-configs/:configKey/validate`
- `POST /api/v1/admin/merchants/:appId/platform-configs/:configKey/activate`

This syncs the current `.env` or JSON provider config into `demo_app`.

If the online validation probe itself fails but the API can still accept the config, the quickstart still activates the draft. That keeps the local integration loop moving.

## Default closed loop

With the default setup, you do not need `apps/web`.

The flow is:

1. the startup script writes Alipay page-pay config into the `demo_app` scope
2. merchant side creates an order with `allowedChannels=["alipay_page"]`
3. OpenCashier returns `cashierUrl` and redirects straight to Alipay
4. OpenCashier receives the provider callback on an app-scoped provider notify URL such as `/api/v1/notify/alipay/demo_app`
5. OpenCashier forwards the merchant notification to quickstart `/notify/opencashier`
6. the result page queries order status again and compares it with the local snapshot

## When `apps/web` is still needed

- You switch `allowedChannels` to a QR-based channel such as `alipay_qr`.
- You prefer managing provider config in the UI instead of letting quickstart provision it through the admin API.

If you want the UI path instead:

1. run `pnpm dev:web`
2. open `http://localhost:5173/settings`
3. configure providers manually
4. set `OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=0` in quickstart

## Files

Recommended reading order:

- `src/main.ts`
- `src/config.ts`
- `src/server.ts`
- `src/client.ts`

Supporting files:

- `.env.example`
- `provider-config.example.json`
- `src/store.ts`
