# OpenCashier

OpenCashier is an open-source hosted checkout and payment orchestration platform for teams that want one backend to manage merchant APIs, cashier pages, order/refund flows, and provider-specific integrations.

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

> Status: pre-1.0. Current channel status:
>
> - Alipay: available
> - Stripe: available
> - WeChat Pay: in testing
> - PayPal: not available yet

## Why OpenCashier

- Hosted cashier entry with signed token URLs instead of exposing platform order numbers directly
- Unified merchant-facing APIs for orders, order queries, cancellations, refunds, and webhook callbacks
- Platform-managed provider webhooks with downstream merchant notification forwarding and retry backoff
- Multi-provider abstraction layer that prefers official Node SDKs and falls back to direct API calls when needed
- `pnpm workspace` monorepo built with NestJS, Prisma, PostgreSQL, React, and Ant Design

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Merchant API | Available | Supports create order, query order, close order, refund, and notification retry flows |
| Hosted cashier | Available | Signed-token hosted cashier entry with persisted channel session data |
| Alipay | Available | Covers real payment creation, query, close, refund, and webhook signature verification |
| WeChat Pay | In testing | Mostly reserved scaffolding and direct API integration placeholders |
| Stripe | Available | Supports Stripe Hosted Checkout, order query, session expiration or close, refund, and webhook signature verification. Card-only for now |
| PayPal | Not available yet | Official Node SDK slot is reserved, but the real transaction flow is not finished |

## Quick Start

1. Install dependencies

```bash
pnpm install
```

2. Start infrastructure

```bash
docker compose up -d
```

3. Copy environment variables

```bash
cp .env.example .env
```

4. Generate Prisma Client and sync the schema

```bash
pnpm prisma:generate
pnpm prisma:db:push
```

5. Start the development workspace

```bash
pnpm dev
```

6. Run the merchant-side smoke test

```bash
pnpm smoke:merchant
```

For environment setup, local tunnel usage, default endpoints, seeded demo data, and provider-specific keys, use the docs below instead of the README.

## Project Layout

```text
apps/
  api/   # NestJS API
  web/   # React + Ant Design admin console and cashier shell
packages/
  shared/        # Shared types and constants
  wechatpay-sdk  # WeChat Pay SDK wrapper
docs/            # Design, integration, and setup docs
skills/
```

## Documentation

- Chinese README: [README.zh-CN.md](./README.zh-CN.md)
- Local development notes (Chinese): [docs/local-development.md](./docs/local-development.md)
- Alipay configuration notes (Chinese): [docs/alipay-configuration.md](./docs/alipay-configuration.md)
- Merchant integration guide (Chinese): [docs/plan-merchant-api-integration.md](./docs/plan-merchant-api-integration.md)
- Alipay hosted cashier routing notes (Chinese): [docs/plan-alipay-unified-cashier-routing.md](./docs/plan-alipay-unified-cashier-routing.md)
- Payment webhook event design (Chinese): [docs/plan-payment-webhook-event-design.md](./docs/plan-payment-webhook-event-design.md)
- Stripe integration plan (Chinese): [docs/plan-stripe-integration.md](./docs/plan-stripe-integration.md)
- WeChat Pay integration plan (Chinese): [docs/plan-wechatpay-integration.md](./docs/plan-wechatpay-integration.md)
- Product background and PRD (Chinese): [docs/plan-prd.md](./docs/plan-prd.md)

Most deep-dive docs are currently Chinese-first. English and bilingual documentation contributions are welcome.

## Community

- Contributing guide: [CONTRIBUTING.md](./.github/CONTRIBUTING.md)
- Support and usage help: [SUPPORT.md](./.github/SUPPORT.md)
- Security policy: [SECURITY.md](./.github/SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](./.github/CODE_OF_CONDUCT.md)
