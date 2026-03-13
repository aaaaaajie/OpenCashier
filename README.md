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
`PLATFORM_CONFIG_MASTER_KEY` 用于加密后台写入数据库的私钥和 Secret，生产环境请务必替换。
支付渠道参数已经迁移到后台数据库，SDK 不再直接从环境变量读取 `ALIPAY_*`、`STRIPE_*`、`PAYPAL_*`、`WECHATPAY_*`。

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

## 支付宝密钥配置

- 当前项目接的是“公钥模式”，不是“证书模式”。
- 也就是说，当前主要配置是 `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_GATEWAY`。
- 当前代码没有接 `appCertPath`、`alipayRootCertPath`、`alipayPublicCertPath` 这一套证书模式参数；如果后面要切证书模式，需要单独扩展。
- `ALIPAY_PRIVATE_KEY` 和 `ALIPAY_PUBLIC_KEY` 都支持两种写法：直接填 PEM 字符串，或填本地文件路径。
- 直接填字符串时，建议写成单行并用 `\n` 表示换行。
- 填路径时支持绝对路径，也支持相对项目根目录的路径，例如 `./certs/alipay/app-private-key.pem`。
- 如果值看起来像路径但文件不存在，启动时会直接报错，避免把路径字符串误当成密钥内容。
- 后台“系统设置”页现在可以新增和维护这些参数；支付渠道运行时只读取数据库配置。
- 私钥和 Secret 在界面上不会回显当前值；如果配置了 `PLATFORM_CONFIG_MASTER_KEY`，它们会以加密形式入库。
- 支付宝异步回调地址由系统基于 `APP_BASE_URL` 内置生成，不再单独配置。

变量说明：

- `ALIPAY_APP_ID`
  来源：支付宝开放平台创建“支付应用”后，在应用详情里获取应用 ID。
  说明：这是支付宝分配给应用的唯一标识，不是商户号，也不是 PID。
- `ALIPAY_PRIVATE_KEY`
  来源：你本地生成的“应用私钥”；对应的“应用公钥”需要上传到支付宝开放平台的接口加签配置里。
  说明：服务端签名时使用，必须保存在你自己的服务端，不能泄露。
- `ALIPAY_PUBLIC_KEY`
  来源：支付宝开放平台“开发设置 / 接口加签方式”里的“支付宝公钥查看”。
  说明：这是支付宝平台公钥，用于验签支付宝返回和异步通知；不是你自己的应用公钥。
- `ALIPAY_GATEWAY`
  来源：支付宝官方网关地址。
  说明：以支付宝开放平台当前展示为准；你现在提供的沙箱网关是 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`，生产环境通常是 `https://openapi.alipay.com/gateway.do`。

补充说明：

- 你会看到支付宝平台里还有“应用公钥”这个概念，但当前项目不需要单独配置 `ALIPAY_APP_PUBLIC_KEY`。
- 原因是公钥模式下，平台保存你的应用公钥；你服务端只需要持有应用私钥，并持有支付宝公钥用于验签。
- 如果后面改成证书模式，才会变成“应用公钥证书 + 支付宝公钥证书 + 支付宝根证书”这一套。

## 本地支付宝回调隧道

- 支付宝要求回调地址必须是公网 HTTPS 地址；本地开发时，可以通过隧道工具临时暴露 `POST /api/v1/notify/alipay`。
- 回调地址格式会像这样：`https://随机子域名.trycloudflare.com/api/v1/notify/alipay`。
- 这个地址不是项目自己生成的，而是由 `cloudflared`、`localhost.run` 或 `localtunnel` 这类外部隧道服务分配。
- 项目里已经提供了本地脚本，会自动检测可用工具并输出正确的支付宝回调地址。

先启动 API：

```bash
pnpm dev:api
```

再启动隧道：

```bash
pnpm tunnel:alipay
```

脚本会自动：

- 优先尝试 `cloudflared`，其次 `localhost.run`，最后 `localtunnel`
- 输出 `Public URL` 和最终的 `Notify URL`
- 确认这个公网域名已经配置到平台基础配置 `APP_BASE_URL`

虽然脚本仍保留 `--write-env` 参数，但现在写入的是 `.env` 里的 `APP_BASE_URL`。

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
- 退款不再本地伪成功；当前只会对已支持且已配置的真实渠道发起退款，不支持时返回 `CHANNEL_UNAVAILABLE`

## 接入文档

- 外部业务系统接入教程：[merchant-api-integration.md](/Users/huoshijie/code/payment-platform/docs/merchant-api-integration.md)
