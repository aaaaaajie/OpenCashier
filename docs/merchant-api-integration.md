# 商户 API 接入与自测

当前对外接入默认采用 `HMAC-SHA256`。

## 必填请求头

- `X-App-Id`
- `X-Timestamp`
- `X-Nonce`
- `X-Sign-Type`
- `X-Sign`
- `Idempotency-Key`

说明：

- `Idempotency-Key` 只对写接口必填：创建订单、关闭订单、发起退款。
- `X-Timestamp` 允许 5 分钟误差。
- `X-Nonce` 在平台侧做短窗口防重，重复使用会返回 `NONCE_REPLAY`。

## 签名串规则

签名串按以下顺序拼接，使用换行符连接：

```text
HTTP_METHOD
PATH_WITH_SORTED_QUERY
X-App-Id
X-Timestamp
X-Nonce
SHA256(CANONICAL_JSON_BODY)
```

规则说明：

- `PATH_WITH_SORTED_QUERY` 示例：`/api/v1/orders?merchantOrderNo=ORDER_10001`
- Query 参数按 `key` 升序排序；同名参数按 `value` 升序排序。
- Body 使用稳定 JSON 序列化：
  - 对象 key 按字典序排序
  - 数组保留原顺序
  - 无 body 时使用空字符串

签名算法：

```text
hex(HMAC_SHA256(app_secret, signing_content))
```

## 回调验收规则

- 平台回调商户 `notify_url` 时会带：
  - `X-App-Id`
  - `X-Notify-Id`
  - `X-Timestamp`
  - `X-Nonce`
  - `X-Sign-Type`
  - `X-Sign`
- 商户返回纯文本 `success` 才视为回调成功。
- 非 `2xx`、超时、返回体不是 `success`，都会进入重试。

## 本地 smoke 测试

先启动：

```bash
docker compose up -d
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_platform?schema=public pnpm prisma:generate
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_platform?schema=public pnpm prisma:db:push
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_platform?schema=public APP_SECRET=local-dev-app-secret pnpm dev:api
```

再运行：

```bash
API_BASE_URL=http://localhost:3000/api/v1 APP_ID=demo_app MERCHANT_SECRET=demo_app_secret node scripts/smoke-merchant-api.mjs
```

Smoke 脚本会验证：

- HMAC 签名请求
- nonce 防重
- 创建订单幂等回放
- 按商户单号和平台单号查单
- 收银台 token 可访问
- 关闭订单幂等回放
