# Merchant Quickstart

[English](./README.md)

这是一份最小化的 OpenCashier 商户侧接入参考实现。

它覆盖的是商户接入主链路：

- 商户请求签名
- 创建订单并拿到 `cashierUrl`
- 浏览器跳转到托管收银台
- 验签 OpenCashier 异步通知
- 在结果页主动查单做状态兜底

它不包含退款、自定义收银台。

## 前提
开始之前，请先配置 .env，默认配置如下：
- `PORT=4100`
- `APP_BASE_URL=http://127.0.0.1:4100`
- `OPENCASHIER_API_BASE_URL=http://127.0.0.1:3000/api/v1`
- `OPENCASHIER_APP_ID=demo_app`
- `OPENCASHIER_APP_SECRET=demo_app_secret`
- `OPENCASHIER_NOTIFY_URL` 默认是 `${APP_BASE_URL}/notify/opencashier`
- `OPENCASHIER_ALLOWED_CHANNELS=alipay_page`
  会透传到创建订单接口的 `allowedChannels`。见[公共文档里的 `allowedChannels` 取值说明](https://opencashier-docs.vercel.app/zh-CN/merchant-api-integration#24-allowedchannels-%E5%8F%96%E5%80%BC%E8%AF%B4%E6%98%8E)。
- `ENABLE_DEMO_DATA=1`

## 启动

```bash
pnpm install
pnpm dev:api
pnpm dev:merchant-quickstart
```

然后打开 [http://127.0.0.1:4100](http://127.0.0.1:4100)。

如果你希望真正完成一次支付和异步通知闭环，需要先在 OpenCashier 里配置至少一个可用支付渠道。

## 关键文件

- `src/config.ts`
- `src/server.ts`
- `src/opencashier-client.ts`
- `src/signing.ts`
- `src/notify-verify.ts`
- `src/store.ts`
