# 镜像部署指南

本文档定义 OpenCashier 基于官方容器镜像的标准部署方式。标准部署支持两种模式：

- 方案 A：直接部署
- 方案 B：接入现有反向代理

两种方案共用同一套镜像、同一份基础编排文件和同一套版本标签策略。差异只在公网入口和 Docker 网络接入方式。

## 1. 文件职责

仓库中的容器编排文件按职责拆分如下：

- `docker-compose.infrastructure.yml`
  - 本地开发基础设施
  - 仅启动 PostgreSQL 和 Redis
  - 不用于服务器部署
- `docker-compose.deploy.yml`
  - 镜像部署基础编排文件
  - 启动 `web`、`api` 和 `postgres`
  - 适用于所有服务器部署场景
- `docker-compose.deploy.reverse-proxy.yml`
  - 反向代理扩展编排文件
  - 为 `web`、`api` 容器追加外部 Docker 网络与网络别名
  - 仅在现有网关本身也运行于 Docker 时使用
- `.env.deploy.example`
  - 部署环境变量模板

## 2. 选择部署模式

部署模式按服务器入口结构选择：

| 场景 | 使用方式 |
| --- | --- |
| 独立部署 OpenCashier，由 OpenCashier 自己占用公网端口 | 方案 A：直接部署 |
| 服务器已存在 Nginx、Caddy、Traefik 或其他网关，需要共用 `80/443` | 方案 B：接入现有反向代理 |

反向代理不是默认前提。对首次验证、独立部署、单系统部署，直接使用方案 A 即可。

## 3. 部署拓扑

标准部署拓扑包含三个容器：

- `web`
  - 托管前端静态资源
  - 作为 OpenCashier 的 Web 入口
  - 将 `/api/*` 转发到 `api`
- `api`
  - 提供 Merchant API
  - 提供管理后台 API
  - 提供 Swagger
  - 提供托管收银台入口
- `postgres`
  - 存储订单、退款、通知和平台配置数据

OpenCashier 内部容器之间使用唯一内部主机名通信：

- `opencashier-web`
- `opencashier-api`
- `opencashier-postgres`

这样可以避免与共享 Docker 网络中的其他项目服务名发生冲突。

对外访问地址统一如下：

- 管理后台：`https://pay.example.com/`
- Merchant API：`https://pay.example.com/api/v1`
- Swagger：`https://pay.example.com/api/docs`
- 托管收银台：`https://pay.example.com/api/cashier/{cashierToken}`

## 4. 运行要求

基础要求如下：

- Docker Engine
- Docker Compose v2
- Linux 服务器
- 公网域名

方案 A 额外要求：

- OpenCashier 可直接占用一个公网监听端口

方案 B 额外要求：

- 现有反向代理已可提供公网入口
- 现有反向代理与 OpenCashier 可加入同一个 Docker 网络

## 5. 镜像标签策略

镜像标签分为三类：

- 预发布标签：`v0.1.0-beta.1`
- 正式版本标签：`v0.1.0`
- 稳定别名标签：`latest`

部署环境通过 `OPENCASHIER_IMAGE_TAG` 选择镜像版本。部署使用显式版本标签，例如 `v0.1.0-beta.1` 或 `v0.1.0`。回滚通过回退 `OPENCASHIER_IMAGE_TAG` 完成。

标准部署编排文件默认不设置 `pull_policy: always`。日常执行 `docker compose up -d` 不会强制回源检查镜像；首次部署、升级和回滚时，显式执行一次 `docker compose pull` 即可。

## 6. 通用准备

### 6.1 复制部署环境变量

```bash
cp .env.deploy.example .env.deploy
```

### 6.2 设置必填变量

首次部署前完成以下变量配置：

- `APP_SECRET`
- `PLATFORM_CONFIG_MASTER_KEY`
- `APP_BASE_URL`
- `WEB_BASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`

标准公网地址配置如下：

```text
APP_BASE_URL=https://pay.example.com
WEB_BASE_URL=https://pay.example.com
APP_API_BASE_URL=/api/v1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-admin-password
ENABLE_DEMO_DATA=0
```

默认内置 PostgreSQL 的连接地址由部署编排自动生成，主机名固定为 `opencashier-postgres`。仅在接入外部数据库时，才需要显式设置 `DATABASE_URL`。

### 6.3 后台访问安全

OpenCashier 现在明确区分公开支付入口和后台管理入口：

- `/api/cashier/*` 和商户自己的签名 API 对外开放
- `/api/v1/admin/*` 必须通过管理员认证
- Web 管理后台会先检查管理员会话，没有管理员凭据时无法读取或修改配置

如果没有配置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，API 会直接拒绝启动；本地和生产环境使用同一套管理员认证逻辑。

如果你不希望线上生成预置 demo 商户，请保持：

```text
ENABLE_DEMO_DATA=0
```

## 7. 方案 A：直接部署

本方案由 OpenCashier 自己对外暴露 `web` 端口。适用于独立服务器、独立域名或首次快速部署验证。

### 7.1 推荐环境变量

```text
WEB_PUBLISHED_BIND=0.0.0.0
WEB_PUBLISHED_PORT=80
```

### 7.2 启动服务

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

### 7.3 检查状态

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml ps
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f
```

## 8. 方案 B：接入现有反向代理

本方案适用于服务器已存在统一公网入口，OpenCashier 作为一个额外站点或子域名接入现有网关。

### 8.1 适用前提

本方案要求现有反向代理满足以下条件：

- 反向代理本身运行在 Docker 中
- 反向代理与 OpenCashier 可以加入同一个外部 Docker 网络
- 反向代理使用网络别名访问 OpenCashier `web` 容器

如果现有反向代理直接运行在宿主机，而不是 Docker 容器内，应在主反向代理中直接转发到 `127.0.0.1:${WEB_PUBLISHED_PORT}`，无需使用 `docker-compose.deploy.reverse-proxy.yml`。

### 8.2 推荐环境变量

```text
WEB_PUBLISHED_BIND=127.0.0.1
WEB_PUBLISHED_PORT=18080
OPENCASHIER_REVERSE_PROXY_NETWORK=xxx
OPENCASHIER_API_NETWORK_ALIAS=opencashier-api
OPENCASHIER_WEB_NETWORK_ALIAS=opencashier-web
```

变量说明如下：

- `WEB_PUBLISHED_BIND=127.0.0.1`
  - `web` 仅监听本机，不直接暴露公网端口
- `WEB_PUBLISHED_PORT=18080`
  - 宿主机本地转发端口
- `OPENCASHIER_REVERSE_PROXY_NETWORK`
  - 现有 Docker 网关所在的外部网络名称
- `OPENCASHIER_API_NETWORK_ALIAS`
  - 现有 Docker 网关访问 OpenCashier `api` 的上游名称
- `OPENCASHIER_WEB_NETWORK_ALIAS`
  - 现有网关访问 OpenCashier `web` 的上游名称

### 8.3 启动服务

```bash
docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  pull

docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  up -d
```

### 8.4 检查状态

```bash
docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  ps

docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  logs -f
```

### 8.5 现有网关的反向代理要求

对 Dockerized 网关，推荐在 `cashier` 站点内直接分流：

- `/` 转发到 `OPENCASHIER_WEB_NETWORK_ALIAS`
- `/api/` 转发到 `OPENCASHIER_API_NETWORK_ALIAS`

推荐原因如下：

- `cashier.linkmind.site` 站点下的 `/` 和 `/api/` 都直接归属 OpenCashier
- API 少经过一次 `web -> api` 转发
- 共享 Docker 网络时，不会与其他项目里的通用服务名 `api`、`web` 冲突
- 主网关层可以清晰表达同一二级域名下的前端与 API 路由归属

示例 Nginx 配置如下：

```nginx
upstream opencashier_web {
    least_conn;
    server opencashier-web:80 max_fails=3 fail_timeout=30s;
    keepalive 16;
}

upstream opencashier_api {
    least_conn;
    server opencashier-api:3000 max_fails=3 fail_timeout=30s;
    keepalive 16;
}

server {
    listen 443 ssl http2;
    server_name cashier.example.com;

    ssl_certificate /etc/nginx/ssl/cashier-fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/cashier-privkey.pem;

    location /api/ {
        proxy_pass http://opencashier_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://opencashier_web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

对于宿主机 Nginx，或不希望拆分 `/` 和 `/api/` 的场景，仍可将整个站点统一转发到 `web`。此时 OpenCashier `web` 会继续在内部将 `/api/*` 转发到 `api`。

## 9. 升级

`.env.deploy` 中更新 `OPENCASHIER_IMAGE_TAG` 后，重新拉取并启动服务。

方案 A：

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

方案 B：

```bash
docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  pull

docker compose --env-file .env.deploy \
  -f docker-compose.deploy.yml \
  -f docker-compose.deploy.reverse-proxy.yml \
  up -d
```

## 10. 回滚

将 `OPENCASHIER_IMAGE_TAG` 回退到目标版本后，按当前部署模式重新执行 `pull` 和 `up -d`。

## 11. 数据库

默认部署文件内置 PostgreSQL，并通过命名卷 `postgres-data` 持久化数据。该结构适用于单机部署和标准镜像部署路径。

外部托管 PostgreSQL 使用 `DATABASE_URL` 覆盖默认连接：

```text
DATABASE_URL=postgresql://user:password@db.example.com:5432/cashier?schema=public
```

接入外部数据库后，可按实际拓扑移除 `postgres` 服务。

## 12. 数据库结构同步

API 容器启动时默认执行：

```text
prisma db push
```

由外部迁移流程接管数据库结构时，设置：

```text
SKIP_PRISMA_DB_PUSH=1
```

## 13. 前端 API 运行时配置

`web` 容器默认使用以下运行时配置：

```text
APP_API_BASE_URL=/api/v1
```

该配置使前端通过同域名 `/api/v1` 访问 API，而不是将 API 地址写入构建产物。绝对地址覆盖方式如下：

```text
APP_API_BASE_URL=https://another-host.example.com/api/v1
```

部署完成后，管理员也可以直接在后台“商户应用”页查看并复制 Merchant API 根地址和 Swagger 地址，无需再自己推导 API path。

## 14. 镜像发布

默认镜像发布目标为 GitHub Container Registry：

- `ghcr.io/<owner>/opencashier-api`
- `ghcr.io/<owner>/opencashier-web`

发布规则如下：

- `v*` tag 推送生成对应版本标签
- 每次 tag 构建生成对应 `sha-*` 标签
- 稳定版本 tag 额外生成 `latest`

自动发布流程定义在 `.github/workflows/publish-images.yml`。

### 14.1 可选的国内镜像源

工作流支持在发布到 GHCR 的同时，额外推送到一个可选镜像仓库。该镜像仓库可用于中国大陆服务器部署，例如阿里云 ACR 个人版。

配置方式如下：

- GitHub Actions Variables
  - `MIRROR_REGISTRY`
    - 例如 `registry.cn-hangzhou.aliyuncs.com`
  - `MIRROR_NAMESPACE`
    - 例如 `your-namespace`
- GitHub Actions Secrets
  - `MIRROR_REGISTRY_USERNAME`
  - `MIRROR_REGISTRY_PASSWORD`

当以上变量和 Secrets 全部存在时，每次 `v*` tag 发布会同时推送：

- `ghcr.io/<owner>/opencashier-api`
- `ghcr.io/<owner>/opencashier-web`
- `<MIRROR_REGISTRY>/<MIRROR_NAMESPACE>/opencashier-api`
- `<MIRROR_REGISTRY>/<MIRROR_NAMESPACE>/opencashier-web`

如果未配置镜像仓库变量或 Secrets，工作流会继续只发布到 GHCR。

### 14.2 国内服务器部署

国内服务器如果优先使用国内镜像仓库，在 `.env.deploy` 中改为对应 registry 和 namespace：

```text
OPENCASHIER_REGISTRY=registry.cn-hangzhou.aliyuncs.com
OPENCASHIER_NAMESPACE=your-namespace
OPENCASHIER_IMAGE_TAG=v0.1.0
```

若需要回退到 GHCR，只需将 `OPENCASHIER_REGISTRY` 和 `OPENCASHIER_NAMESPACE` 改回默认值。
