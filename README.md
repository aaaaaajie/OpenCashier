# Payment Platform

统一收银台第一阶段框架，基于：

- NestJS + Prisma + PostgreSQL
- React + Ant Design
- pnpm workspace monorepo
- 多支付平台抽象层，优先官方 Node SDK，无官方 SDK 时再走 API 直连

## 目录

```text
apps/
  api/   # NestJS API
  web/   # React + Ant Design 管理台与收银台骨架
packages/
  shared/ # 共享类型和常量
docs/
skills/
```

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 启动基础设施

```bash
docker compose up -d
```

3. 复制环境变量

```bash
cp .env.example .env
```

根目录 `.env` 会同时被 API 和 Web 读取，前端只会暴露 `VITE_` 前缀变量。
`APP_SECRET` 用于签发公开收银台 token，开发环境可先用 `.env.example` 的默认值。

4. 生成 Prisma Client 并运行开发迁移

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev
```

5. 启动开发环境

```bash
pnpm dev
```

6. 跑商户侧 smoke 测试

```bash
pnpm smoke:merchant
```

## 默认地址

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:5173`

## 当前渠道抽象策略

- 支付宝：已开始接入官方 Node SDK，当前收银台可生成 `alipay_qr` / `alipay_wap` 会话
- Stripe：预留官方 Node SDK 接入位
- PayPal：预留官方 Node SDK 接入位
- 微信支付：当前按 API 直连方式预留

## 当前数据状态

- 商户应用、订单、退款已经切到 Prisma + PostgreSQL
- 启动 API 后会自动写入最小 demo 数据，方便本地联调后台和收银台
- 默认会写入两个 HMAC 演示应用：`demo_app`、`demo_app_other`
- 收银台会把真实渠道会话写入 `pay_attempt`，便于后续补查单、关单和回调处理
- 支付宝异步通知入口固定为 `/api/v1/notify/alipay`，对外商户 `notifyUrl` 继续保存在订单里，后续由平台统一投递
- 商户异步通知任务会自动扫描 `notify_task` 并按 `1m / 5m / 15m / 30m / 1h / 6h` 退避重试
- 后台通知任务页读取 `/api/v1/admin/notifications`，支持手动补发 `POST /api/v1/admin/notifications/:notifyId/retry`
- 商户请求现在要求 `HMAC-SHA256 + X-Timestamp + X-Nonce + Idempotency-Key`
- 收银台 URL 现在使用签名 token，不再直接暴露平台单号

## 接入文档

- 商户签名与自测说明：[merchant-api-integration.md](/Users/huoshijie/code/payment-platform/docs/merchant-api-integration.md)
