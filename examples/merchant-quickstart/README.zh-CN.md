# Merchant Quickstart

[English](./README.md)

这是一个面向商户开发者的最小接入示例。

默认路径覆盖 5 个动作：

- 用商户密钥签名请求
- 创建订单并拿到 `cashierUrl`
- 接收并验签 OpenCashier 的商户通知
- 在结果页主动查单做兜底
- 可选地在服务启动前准备一份 app-scoped 渠道配置

不包含退款和自定义收银台。

## 前提

1. 在 OpenCashier 项目根目录准备 API 侧 `.env`。

```env
ENABLE_DEMO_DATA=1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
```

2. 复制 quickstart 自己的 `.env`。

```bash
cp examples/merchant-quickstart/.env.example examples/merchant-quickstart/.env
```

3. 按你的真实渠道补齐 quickstart `.env` 或 `provider-config.local.json`。

- `.env` 里保留的是最短可跑路径。
- `provider-config.example.json` 适合多行密钥或证书。
- 字段含义、可选值、`allowedChannels` 对照表见公共文档：
  - [Merchant Quickstart 渠道配置](https://opencashier-docs.vercel.app/zh-CN/provider-config-reference#merchant-quickstart)
  - [allowedChannels 与渠道分组](https://opencashier-docs.vercel.app/zh-CN/provider-config-reference#allowedchannels-and-provider-groups)

默认值：

- `OPENCASHIER_APP_ID=demo_app`
- `OPENCASHIER_APP_SECRET=demo_app_secret`
- `OPENCASHIER_ALLOWED_CHANNELS=alipay_page`
- `OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=1`
- `OPENCASHIER_PROVIDER_GROUP=alipay`

说明：

- `demo_app` 由 `ENABLE_DEMO_DATA=1` 自动生成。
- `OPENCASHIER_ADMIN_USERNAME` / `OPENCASHIER_ADMIN_PASSWORD` 必须和 API 根目录的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 一致。
- 默认示例会在服务启动前把支付宝配置写到 `demo_app` 这个商户应用作用域下，不再依赖先打开后台 UI 配置渠道。

## 运行

```bash
pnpm install
pnpm dev:api
pnpm dev:merchant-quickstart
```

打开 [http://127.0.0.1:4100](http://127.0.0.1:4100)。

在 HTTP 服务启动前，`pnpm dev:merchant-quickstart` 会先调用：

- `PUT /api/v1/admin/merchants/:appId/platform-configs`
- `POST /api/v1/admin/merchants/:appId/platform-configs/:configKey/validate`
- `POST /api/v1/admin/merchants/:appId/platform-configs/:configKey/activate`

把当前 `.env` 或 JSON 文件中的渠道配置同步到 `demo_app`。

如果在线验证探针本身失败，但 API 已经能接受这组配置，quickstart 仍然会把 draft 激活。这样本地接入演示不会被单独一条验证探针卡住。

## 默认闭环

默认配置下，不需要启动 `apps/web`。

链路是：

1. 启动脚本先写入 `demo_app` 的支付宝页面支付配置。
2. 商户侧创建订单，`allowedChannels=["alipay_page"]`。
3. OpenCashier 返回 `cashierUrl`，并直接跳转支付宝页面。
4. OpenCashier 用 `/api/v1/notify/alipay/demo_app` 这类 app-scoped provider notify URL 接收渠道回调。
5. OpenCashier 再把商户通知发到 quickstart 的 `/notify/opencashier`。
6. 结果页主动查单，和本地快照对照。

## 什么时候还需要 `apps/web`

- 你把 `allowedChannels` 改成 `alipay_qr`、`wechat_qr` 这类需要托管二维码页面的渠道。
- 你想手动在 UI 里维护渠道配置，而不是让 quickstart 通过 admin API 自动写入。

如果你更想走 UI 配置路径：

1. 启动 `pnpm dev:web`
2. 打开 `http://localhost:5173/settings`
3. 手动配置渠道
4. 把 quickstart 的 `OPENCASHIER_BOOTSTRAP_PROVIDER_CONFIG=0`

## 关键文件

建议阅读顺序：

- `src/main.ts`
- `src/config.ts`
- `src/server.ts`
- `src/client.ts`
- `src/opencashier-client.ts`

补充文件：

- `.env.example`
- `provider-config.example.json`
- `src/signing.ts`
- `src/notify-verify.ts`
- `src/store.ts`
