# OpenCashier

OpenCashier 是一个开源的统一收银台 / 支付编排平台，目标是让业务系统只对接一套商户 API 和一套托管收银台，再由平台统一管理支付宝、微信支付、Stripe、PayPal 等支付渠道的差异。

English README: [README.md](./README.md)

> 状态：pre-1.0。当前渠道支持情况：
>
> - 支付宝：可用
> - Stripe：可用
> - 微信支付：测试中
> - PayPal：暂未可用

## 为什么是 OpenCashier

- 托管式收银台入口，使用签名 token URL，不直接暴露平台单号
- 商户侧统一订单、查单、关单、退款与通知回调接入面
- 平台统一接收渠道异步通知，再转发给商户并按退避策略重试
- 多支付平台抽象层，优先官方 Node SDK，无官方 SDK 时再走 API 直连
- `pnpm workspace` monorepo，技术栈为 NestJS、Prisma、PostgreSQL、React、Ant Design

## 当前状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Merchant API | 可用 | 支持下单、查单、关单、退款、通知重试等基础能力 |
| Hosted cashier | 可用 | 支持签名 token 收银台入口和渠道会话落库 |
| Alipay | 可用 | 已覆盖真实下单、查单、关单、退款、回调验签 |
| WeChat Pay | 测试中 | 当前主要是 API 直连预留和骨架能力 |
| Stripe | 可用 | 已接通 Stripe Hosted Checkout、查单、会话失效或关单、退款和 webhook 验签；当前仅开放 card |
| PayPal | 暂未可用 | 已预留官方 Node SDK 接入位，真实交易链路未完成 |

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 启动基础设施

```bash
docker compose -f docker-compose.infrastructure.yml up -d
```

3. 复制环境变量

```bash
cp .env.example .env
```

4. 生成 Prisma Client 并同步数据库结构

```bash
pnpm prisma:generate
pnpm prisma:db:push
```

5. 启动开发环境

```bash
pnpm dev
```

6. 登录后台并确认商户应用

- 管理后台：`http://localhost:5173`
- 默认管理员账号：`admin`
- 默认管理员密码：`local-dev-admin-password`
- `.env.example` 默认开启 `ENABLE_DEMO_DATA=1`，因此本地会自动生成 `demo_app`

7. 跑商户侧 smoke 测试

```bash
pnpm smoke:merchant
```

环境变量、本地联调、默认地址、seed 数据、支付渠道密钥配置等细节，统一放到下面的文档里，不再堆在首页 README。

## Merchant Quickstart 示例

如果你想先看一份可运行的商户侧参考实现，而不是直接起完整工作区，可以先试 [examples/merchant-quickstart/README.zh-CN.md](./examples/merchant-quickstart/README.zh-CN.md)。这个 example 把官方 Node SDK 下单、跳转 `cashierUrl`、通知验签和结果页查单兜底放在了一个小应用里。

它现在也会通过 admin API 把渠道配置写到商户应用作用域里，所以默认的 `alipay_page` 示例不再要求先启动 `apps/web`。如果你想切到二维码类渠道，或者更喜欢在 UI 里手工配置渠道，再启动 `pnpm dev:web` 即可。

```bash
pnpm dev:api
pnpm dev:merchant-quickstart
```

然后打开 `http://127.0.0.1:4100`。

## 项目结构

```text
apps/
  api/   # API
  web/   # 收银管理后台
examples/
  merchant-quickstart/  # 可运行的商户侧接入参考
packages/
  sdk/           # 商户 Node/TypeScript SDK
  shared/        # 共享类型和常量
  wechatpay-sdk  # 微信支付 SDK 封装
docs/            # 内部计划与说明
skills/
```

## 文档

- 镜像部署指南: [opencashier-docs.vercel.app/zh-CN/deployment](https://opencashier-docs.vercel.app/zh-CN/deployment)
- 商户接入指南: [opencashier-docs.vercel.app/zh-CN/merchant-api-integration](https://opencashier-docs.vercel.app/zh-CN/merchant-api-integration)
- Merchant Quickstart 示例: [examples/merchant-quickstart/README.zh-CN.md](./examples/merchant-quickstart/README.zh-CN.md)

当前深度文档仍以中文为主；如果你希望补英文文档或双语说明，欢迎直接发 PR。

## 社区

- 贡献指南: [CONTRIBUTING.md](./.github/CONTRIBUTING.md)
- 支持与使用问题: [SUPPORT.md](./.github/SUPPORT.md)
- 安全漏洞报告: [SECURITY.md](./.github/SECURITY.md)
- 社区行为准则: [CODE_OF_CONDUCT.md](./.github/CODE_OF_CONDUCT.md)
