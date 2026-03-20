# 内部发布草稿

这个文件由 `.github/changelog/unreleased/*.json` 自动生成。

它用于汇总尚未发布、但对外部用户可感知的变更，不属于公开 changelog 的一部分。

请不要手工编辑这个文件。请运行 `pnpm changelog:draft` 或使用同步 workflow。

## 待发布内容

### 新增
- 为 `@opencashier/sdk` 补齐了直接发布到 npm 所需的基础设施，包括可发布的包元数据、包内 README 与 LICENSE、打包后消费者 smoke test，以及手动触发的 GitHub npm 发布 workflow。

### 变更
- 更新了仓库与对外 SDK 文档，把 npm 安装改成外部开发者的默认路径，不再要求开发者先从 monorepo 构建 SDK tarball。

### 修复
- 修复发布流水线：每个已发布 tag 现在会在同一条流程中创建 GitHub Release，并推送对应的 GHCR `opencashier-api` 与 `opencashier-web` 镜像，避免 release 与镜像 tag 不一致。
