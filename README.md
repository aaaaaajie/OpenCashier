# Payment Platform

统一收银台第一阶段框架，基于：

- NestJS + Prisma + PostgreSQL
- React + Ant Design
- pnpm workspace monorepo

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

4. 生成 Prisma Client 并运行开发迁移

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev
```

5. 启动开发环境

```bash
pnpm dev
```

## 默认地址

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:5173`

