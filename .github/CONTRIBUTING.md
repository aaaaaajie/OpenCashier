# Contributing to OpenCashier

Thanks for contributing. This repository is still pre-1.0, so small, focused pull requests are easier to review and much less likely to cause payment-flow regressions.

## Before you start

- Check existing issues and pull requests before starting similar work.
- For large features, architecture changes, or provider-level integrations, open an issue first to align on scope.
- Never commit real payment keys, certificates, merchant secrets, or `.env` files.

## Local development

1. Install dependencies:

```bash
pnpm install
```

2. Start local infrastructure:

```bash
docker compose -f docker-compose.infrastructure.yml up -d
```

3. Copy environment variables:

```bash
cp .env.example .env
```

4. Generate Prisma client and sync the schema:

```bash
pnpm prisma:generate
pnpm prisma:db:push
```

5. Start the workspace:

```bash
pnpm dev
```

## Contribution guidelines

- Keep pull requests focused. One PR should solve one problem.
- Preserve existing provider behavior unless the change explicitly updates that contract.
- Public root changelog files are release-only. If you change APIs, webhook behavior, auth headers, order/refund semantics, deployment topology, environment variables, provider availability, or other user-visible behavior, add a bilingual fragment under `.github/changelog/unreleased/` instead of editing `CHANGELOG.md` or `CHANGELOG.zh-CN.md` directly.
- If you change the cashier or admin UI, include screenshots or a short screen recording in the PR.
- Prefer incremental provider work. A smaller, tested provider step is better than a large unfinished abstraction rewrite.

## Validation

Run the checks that match your change before opening a PR:

```bash
pnpm typecheck
pnpm smoke:merchant
```

Additional commands you may need:

```bash
pnpm build
pnpm test:tunnel
pnpm changelog:validate
pnpm changelog:draft
```

To cut a released changelog entry from pending fragments:

```bash
pnpm changelog:release -- v0.1.0-beta.5 2026-03-20
```

## Pull request checklist

- The change is scoped and explained clearly.
- A `.github/changelog/unreleased/*.json` fragment was added when the change affects deployers, integrators, or other external users.
- Documentation was updated where behavior changed.
- No secrets, production credentials, or private certificates were added.
- Relevant commands were run locally, and the results are described in the PR.

## Communication

- Bug reports: use the bug issue template.
- Feature ideas: use the feature request template.
- Usage or integration questions: use the support/question template.
- Security issues: follow [SECURITY.md](./SECURITY.md).
