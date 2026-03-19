# 变更记录

这个文件只记录 OpenCashier 已发布的公开版本。

本变更记录采用轻量的 Keep a Changelog 结构，只记录外部用户可感知的变化，不复述 commit 历史。

在 changelog 机制建立之前的历史，会按公开 tag 的粒度补录。首个公开 tag 之前的内部开发，不按 commit 逐条回溯，而是汇总到首个公开版本中。

English version: [CHANGELOG.md](./CHANGELOG.md)

## [v0.2.0-beta.1] - 2026-03-19

### 新增
- 新增管理员登录与会话 API，并在 `apps/web` 中接入登录流程，支持可配置的本地开发账号。
- 新增 `examples/merchant-quickstart`，提供可运行的商户接入示例，覆盖 app 作用域渠道配置初始化、跳转 `cashierUrl`、通知验签以及结果页查单兜底。
- 新增工作区包 `@opencashier/sdk`，用于 Node 和 TypeScript 商户接入，覆盖 HMAC 请求签名、订单与退款资源、渠道配置初始化以及通知验签。

### 变更
- 商户渠道配置现在支持按 app 维度管理，默认 `alipay_page` quickstart 路径不再要求先启动 `apps/web`。
- 默认部署栈在启用内置数据库服务时，改为使用内部 PostgreSQL 别名 `opencashier-postgres`。
- 仓库 README 现已将部署与商户接入指南指向公开文档站，不再在主仓库中保留长篇副本。

## [v0.1.0-beta.4] - 2026-03-17

### 新增
- 在反向代理部署 overlay 中新增 `OPENCASHIER_API_NETWORK_ALIAS` 支持，方便上游网关在需要时直接路由到 API 容器。

### 变更
- 扩展反向代理部署说明，覆盖 web 和 API 两个容器别名，便于接入已有网关网络的分流拓扑。

## [v0.1.0-beta.3] - 2026-03-17

### 新增
- 为镜像发布新增可选镜像源仓库支持，并补充面向中国大陆镜像仓库场景的环境变量示例。

### 变更
- 将 API 与 Web 镜像发布合并到同一个发布工作流中，使公开 tag 能稳定生成版本标签、`sha-*` 标签和 `latest` 标签。
- 移除部署 compose 文件中的默认 `pull_policy: always`，让镜像源仓库或私有仓库部署可以显式控制拉取行为。

## [v0.1.0-beta.2] - 2026-03-17

### 新增
- 新增 `docker-compose.deploy.reverse-proxy.yml`，作为接入现有 Docker 化反向代理（如 Nginx、Caddy、Traefik）时的可选 overlay。

### 变更
- 新增 `WEB_PUBLISHED_BIND`，使直接暴露模式可以把 Web 容器绑定到指定主机地址，而不再固定暴露到 `0.0.0.0`。
- 将生产 API 镜像切换为更适合部署的运行时目录结构，并在镜像内完成 Prisma 结构同步，减少容器启动时对完整工作区目录的依赖。
- 更新部署示例，默认使用显式版本标签作为公开部署的镜像引用。

## [v0.1.0-beta.1] - 2026-03-16

### 新增
- 发布首个公开 beta 版本，包含托管收银台流程、商户订单与退款 API、商户通知转发与重试，以及初始后台渠道配置管理能力。
- 新增首套基于镜像的部署基线，包括 Dockerfile、`docker-compose.deploy.yml`、`.env.deploy.example` 以及由 tag 触发的 GHCR 镜像发布。
- 新增首批面向外部用户的商户接入与部署指南、smoke test 脚本以及社区治理文件。

### 变更
- Web 应用改为运行时注入 API 基础地址，使镜像部署可以在不重新构建前端资源的情况下切换 API 地址。
- 明确首个公开版本的渠道可用性基线：支付宝与 Stripe 可用，微信支付测试中，PayPal 预留但尚未开放。

[v0.2.0-beta.1]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.4...v0.2.0-beta.1
[v0.1.0-beta.4]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.3...v0.1.0-beta.4
[v0.1.0-beta.3]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.2...v0.1.0-beta.3
[v0.1.0-beta.2]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.1...v0.1.0-beta.2
[v0.1.0-beta.1]: https://github.com/aaaaaajie/OpenCashier/compare/6882a8c...v0.1.0-beta.1
