# 镜像部署指南

本文档定义 OpenCashier 基于官方容器镜像的标准部署方式。部署入口覆盖服务器安装、版本升级和版本回滚。

## 1. 文件职责

仓库中的容器编排文件按职责拆分如下：

- `docker-compose.infrastructure.yml`
  - 本地开发基础设施
  - 仅启动 PostgreSQL 和 Redis
  - 用于源码开发、联调和测试
- `docker-compose.deploy.yml`
  - 镜像部署入口
  - 启动 `web`、`api` 和 `postgres`
  - 用于服务器部署、升级和回滚
- `.env.deploy.example`
  - `docker-compose.deploy.yml` 对应的环境变量模板

`docker-compose.infrastructure.yml` 不参与服务器部署。服务器部署统一使用 `docker-compose.deploy.yml`。

## 2. 部署拓扑

标准部署拓扑包含三个容器：

- `web`
  - 对外暴露 HTTP 端口
  - 托管前端静态资源
  - 反向代理 `/api/*` 到 `api`
- `api`
  - 提供 Merchant API
  - 提供管理后台 API
  - 提供 Swagger
  - 提供托管收银台入口
- `postgres`
  - 存储订单、退款、通知和平台配置数据

对外只暴露 `web` 容器端口。默认访问地址如下：

- 管理后台：`https://pay.example.com/`
- Merchant API：`https://pay.example.com/api/v1`
- Swagger：`https://pay.example.com/api/docs`
- 托管收银台：`https://pay.example.com/api/cashier/{cashierToken}`

## 3. 运行要求

部署环境要求如下：

- Docker Engine
- Docker Compose v2
- Linux 服务器
- 公网域名
- 80 / 443 端口可用

HTTPS 终止层由上游反向代理或负载均衡承担。常见实现包括 Nginx、Caddy、Traefik 或云厂商负载均衡。

## 4. 镜像标签策略

镜像标签分为三类：

- 预发布标签：`v0.1.0-beta.1`
- 正式版本标签：`v0.1.0`
- 稳定别名标签：`latest`

部署环境通过 `OPENCASHIER_IMAGE_TAG` 选择镜像版本。默认部署使用显式版本标签，例如 `v0.1.0`。版本回滚通过回退 `OPENCASHIER_IMAGE_TAG` 完成。

## 5. 首次部署

### 5.1 复制部署环境变量

```bash
cp .env.deploy.example .env.deploy
```

### 5.2 设置必填变量

首次部署前完成以下变量配置：

- `APP_SECRET`
- `PLATFORM_CONFIG_MASTER_KEY`
- `APP_BASE_URL`
- `WEB_BASE_URL`
- `POSTGRES_PASSWORD`

当前拓扑由 `web` 容器统一对外暴露，`APP_BASE_URL` 与 `WEB_BASE_URL` 使用同一个公网地址：

```text
APP_BASE_URL=https://pay.example.com
WEB_BASE_URL=https://pay.example.com
```

### 5.3 拉取镜像并启动服务

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

### 5.4 检查服务状态

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml ps
```

### 5.5 查看服务日志

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f
```

## 6. 升级

### 6.1 升级到预发布版本

`.env.deploy` 中设置预发布标签：

```text
OPENCASHIER_IMAGE_TAG=v0.1.0-beta.1
```

执行升级命令：

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

### 6.2 升级到正式版本

`.env.deploy` 中设置正式版本标签：

```text
OPENCASHIER_IMAGE_TAG=v0.1.0
```

执行升级命令：

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

## 7. 回滚

将 `OPENCASHIER_IMAGE_TAG` 回退到目标版本，例如：

```text
OPENCASHIER_IMAGE_TAG=v0.1.0
```

重新拉取并启动：

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d
```

## 8. 数据库

默认部署文件内置 PostgreSQL，并通过命名卷 `postgres-data` 持久化数据。该结构适用于单机部署和标准镜像部署路径。

外部托管 PostgreSQL 使用 `DATABASE_URL` 覆盖默认连接：

```text
DATABASE_URL=postgresql://user:password@db.example.com:5432/cashier?schema=public
```

接入外部数据库后，`docker-compose.deploy.yml` 可按实际拓扑移除 `postgres` 服务。

## 9. 数据库结构同步

API 容器启动时默认执行：

```text
prisma db push
```

由外部迁移流程接管数据库结构时，设置：

```text
SKIP_PRISMA_DB_PUSH=1
```

## 10. 前端 API 运行时配置

`web` 容器默认使用以下运行时配置：

```text
APP_API_BASE_URL=/api/v1
```

该配置使前端通过同域名 `/api/v1` 访问 API，而不是将 API 地址写入构建产物。绝对地址覆盖方式如下：

```text
APP_API_BASE_URL=https://another-host.example.com/api/v1
```

## 11. 镜像发布

镜像发布目标为 GitHub Container Registry：

- `ghcr.io/<owner>/opencashier-api`
- `ghcr.io/<owner>/opencashier-web`

发布规则如下：

- `v*` tag 推送生成对应版本标签
- 每次 tag 构建生成对应 `sha-*` 标签
- 稳定版本 tag 额外生成 `latest`

自动发布流程定义在 `.github/workflows/publish-images.yml`。
