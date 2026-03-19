# 内部发布草稿

这个文件由 `.github/changelog/unreleased/*.json` 自动生成。

它用于汇总尚未发布、但对外部用户可感知的变更，不属于公开 changelog 的一部分。

请不要手工编辑这个文件。请运行 `pnpm changelog:draft` 或使用同步 workflow。

## 待发布内容

### 新增
- 新增管理员登录与会话 API，并在 `apps/web` 中接入登录流程，支持可配置的本地开发账号。
- 新增 `examples/merchant-quickstart`，提供可运行的商户接入示例，覆盖 app 作用域渠道配置初始化、跳转 `cashierUrl`、通知验签以及结果页查单兜底。
- 新增工作区包 `@opencashier/sdk`，用于 Node 和 TypeScript 商户接入，覆盖 HMAC 请求签名、订单与退款资源、渠道配置初始化以及通知验签。

### 变更
- 商户渠道配置现在支持按 app 维度管理，默认 `alipay_page` quickstart 路径不再要求先启动 `apps/web`。
- 默认部署栈在启用内置数据库服务时，改为使用内部 PostgreSQL 别名 `opencashier-postgres`。
- 仓库 README 现已将部署与商户接入指南指向公开文档站，不再在主仓库中保留长篇副本。
