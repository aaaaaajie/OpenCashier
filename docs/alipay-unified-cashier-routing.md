# 支付宝统一收银台路由说明

本文说明统一收银台如何在支付宝的不同产品形态之间做选择和回退。

适用范围：

- 默认平台收银台 `cashierUrl`
- 自定义收银台调用 `GET /api/v1/cashier/{cashierToken}` 的场景

## 1. 为什么要做这一层路由

支付宝在是三种真实产品能力：

- `alipay_qr`
  - 当面付 / 扫码支付
  - 对应 `alipay.trade.precreate`
- `alipay_page`
  - 电脑网站支付
  - 对应 `alipay.trade.page.pay`
- `alipay_wap`
  - 手机网站支付
  - 对应 `alipay.trade.wap.pay`

## 2. 策略

统一收银台会结合：

- 当前终端类型
- `ALIPAY_PRODUCT_CAPABILITIES`
- 支付宝接口真实返回结果

自动选择一个最合适的实际支付宝会话。

## 3. 终端优先级

桌面端优先级：

1. `alipay_qr`
2. `alipay_page`
3. `alipay_wap`

移动端优先级：

1. `alipay_wap`
2. `alipay_page`
3. `alipay_qr`

终端类型由收银台前端在请求 `/api/v1/cashier/{cashierToken}` 时通过 `terminal=desktop|mobile` 传给后端。

## 4. 回退规则

当优先产品不可用时，平台会继续尝试下一个产品。例如：

- 桌面端优先尝试 `alipay_qr`
- 如果二维码接口失败，例如返回 `ACCESS_FORBIDDEN`
- 且 `alipay_page` 已开通
- 则统一收银台自动回退到 `alipay_page`

这样即使商户最初希望用户走“支付宝”，也不会因为二维码能力没开通而整体失败。

## 5. 商户 `allowedChannels` 的理解

当前推荐做法：

- 商户只要允许任一支付宝通道，就表示“允许用户使用支付宝完成支付”
- 默认统一收银台可以在支付宝内部产品之间做路由和回退

例如：

```json
{
  "allowedChannels": ["alipay_qr"]
}
```

如果当前支付宝应用没有二维码能力，但网站支付已开通，默认统一收银台仍可能返回：

```json
{
  "channel": "alipay_page",
  "actionType": "REDIRECT_URL",
  "payUrl": "https://openapi.alipay.com/gateway.do?..."
}
```

如果你的业务系统自己实现收银台，不应该把 `allowedChannels` 和实际展示动作做一一硬编码绑定；应以 `/cashier/{cashierToken}` 返回的真实 `channel`、`actionType`、`qrContent`、`payUrl` 为准。

## 6. 后台配置

后台按签约情况配置：

- 已开通当面付：勾选 `QR`
- 已开通电脑网站支付：勾选 `PAGE`
- 已开通手机网站支付：勾选 `WAP`

如果证书、密钥或 AppId 不匹配，即使勾选了产品能力，真实调用仍然会失败；以“验证配置”和实际联调结果为准。

## 7. 结果形态

统一收银台最终只会使用一个当前最合适的支付宝实际会话：

- `QR_CODE`
  - 页面展示二维码
- `REDIRECT_URL`
  - 页面展示“去支付宝支付”按钮
