---
name: opencashier-merchant-integration
description: Integrate an external merchant system, SaaS backend, or business application with the OpenCashier Merchant API. Use when a non-OpenCashier codebase needs to create orders, redirect users to `cashierUrl`, verify OpenCashier notifications, query orders as a fallback, add refunds, or optionally bootstrap provider config. For Node/TypeScript, default to the official SDK. For other stacks, port the signing and verification protocol.
---

# OpenCashier Merchant Integration

Use this skill for external system integration. The default goal is not a custom cashier UI. Finish the shortest working loop first:

1. Initialize the merchant-side OpenCashier client
2. Create an order and receive `cashierUrl`
3. Open `cashierUrl` directly from the frontend
4. Receive and verify OpenCashier merchant notifications on the merchant server
5. Use order query as the fallback path
6. Add refunds when the business flow needs them

## First Read

Read the deployed public docs and the runnable example first. Do not guess contract details from memory.

1. Merchant API guide
   - deployed EN: https://opencashier-docs.vercel.app/en/merchant-api-integration
   - focus sections: `1. Overview`, `4. Signatures & Idempotency`, `5. Standard Integration Flow`, `6. Merchant Async Notifications`, `9. Shortest integration path`
2. Channel and provider mapping
   - deployed EN: https://opencashier-docs.vercel.app/en/provider-config-reference#merchant-quickstart
   - focus sections: `Merchant Quickstart`, `allowedChannels And Provider Groups`
3. Runnable example from the OpenCashier repo
   - README: https://github.com/aaaaaajie/OpenCashier/blob/main/examples/merchant-quickstart/README.md
   - config loading and provider setup mapping: https://github.com/aaaaaajie/OpenCashier/blob/main/examples/merchant-quickstart/src/config.ts
   - server wiring and request flow: https://github.com/aaaaaajie/OpenCashier/blob/main/examples/merchant-quickstart/src/server.ts
   - SDK client entry: https://github.com/aaaaaajie/OpenCashier/blob/main/packages/sdk/src/client.ts
4. Local source fallback when needed
   - local public docs repo: `opencashier-docs/content/en/merchant-api-integration.mdx`
   - local public docs repo: `opencashier-docs/content/en/provider-config-reference.mdx`

## Workflow

1. Inspect the target codebase first. Reuse existing order, payment, callback, and configuration modules instead of creating a separate demo structure.
2. Collect only the minimum integration inputs:
   - `apiBaseUrl`
   - `appId`
   - `appSecret`
   - the merchant system's `notifyUrl`
   - optional `returnUrl`
   - the required `allowedChannels` for this product flow
3. Choose the implementation path based on runtime:
   - Node/TypeScript: use `@opencashier/sdk` first. Initialize `OpenCashierClient`, use resource methods such as `orders.create`, `orders.getByMerchantOrderNo`, `refunds.create`, and `notifications.verify`.
   - Non-Node runtimes: port the signing and notification-verification protocol from the public docs. Reuse the same request and notification contract; do not invent a different merchant API shape.
4. Implement the minimum server-side capabilities first:
   - OpenCashier config loading
   - create order / query order
   - optional close order / refund
   - one merchant notification endpoint that returns plain text `success` after successful verification and processing
5. Finish the product loop before adding extras:
   - persist `merchantOrderNo`, `platformOrderNo`, `cashierUrl`, and `expireTime` when creating the order
   - open `cashierUrl` directly from the frontend or redirect layer
   - use query-order as the fallback for result pages and background reconciliation instead of trusting the browser return alone
6. Ship reliability rules together with the first version:
   - all write APIs must use stable `Idempotency-Key` values
   - merchant notification handling must be idempotent
   - payment success must be determined by notification or order query, not by redirect completion
7. Only add these extensions when explicitly needed:
   - custom cashier UI: `GET /api/v1/cashier/{cashierToken}`
   - app-scoped provider bootstrap: use the SDK `providers` module or the equivalent admin API pattern, mainly for local integration and demos

## Integration Rules

- Default to hosted cashier. Do not rebuild Alipay or Stripe redirect logic inside the merchant system.
- The merchant system should not receive provider callbacks directly. It should only receive the OpenCashier merchant notification.
- If the business flow already knows the exact payment brand, pass a narrow `allowedChannels` set.
- If the target stack is Node/TypeScript, prefer the official SDK over handwritten signing, header injection, notification verification, or error parsing.
- If the target stack is not Node.js, port the signing and verification protocol, not the TypeScript syntax.
- Provider config is an operator concern. Do not treat the quickstart bootstrap path as a required production integration step for merchants.

## Done When

The first integration version is complete only when all of these are true:

1. The target system can create a real OpenCashier order
2. The user can be sent to `cashierUrl`
3. The merchant side can verify and process `PAY_SUCCESS`
4. The system can query orders when notification delivery is delayed or fails
5. If refunds are in scope, `POST /api/v1/refunds` and refund query are integrated
