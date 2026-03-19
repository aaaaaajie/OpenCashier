# Changelog

This file records published OpenCashier releases only.

It follows a lightweight Keep a Changelog structure and focuses on externally visible changes instead of mirroring commit history.

History that predates changelog adoption is backfilled at the public tag level. Work before the first public tag is summarized through that first tagged release instead of being reconstructed commit by commit.

Chinese version: [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)

## [v0.1.0-beta.4] - 2026-03-17

### Added
- Added `OPENCASHIER_API_NETWORK_ALIAS` support to the reverse-proxy deployment overlay so upstream gateways can route directly to the API container when needed.

### Changed
- Expanded reverse-proxy deployment guidance to cover both web and API container aliases, making split routing setups easier to wire into an existing gateway network.

## [v0.1.0-beta.3] - 2026-03-17

### Added
- Added optional mirror registry publishing for image releases, including documented environment variable examples for teams that need a mainland China registry path.

### Changed
- Consolidated API and web image publishing into one release workflow so public tags produce consistent version, `sha-*`, and `latest` tags across both images.
- Removed the default `pull_policy: always` from the deployment compose file so mirrored and private registries can control pull behavior explicitly.

## [v0.1.0-beta.2] - 2026-03-17

### Added
- Added `docker-compose.deploy.reverse-proxy.yml` as an optional overlay for deployments that sit behind an existing Dockerized reverse proxy such as Nginx, Caddy, or Traefik.

### Changed
- Added `WEB_PUBLISHED_BIND` so direct-exposure deployments can bind the web container to a specific host address instead of always exposing `0.0.0.0`.
- Switched the production API image to a deploy-oriented runtime layout and in-image Prisma schema sync path, reducing reliance on the full workspace layout at container startup.
- Updated the deployment examples to use explicit version tags as the default image reference for public deployments.

## [v0.1.0-beta.1] - 2026-03-16

### Added
- Published the first public OpenCashier beta with a hosted cashier flow, merchant order and refund APIs, merchant notification forwarding with retries, and initial admin-side provider configuration management.
- Added the first image-based deployment baseline, including Dockerfiles, `docker-compose.deploy.yml`, `.env.deploy.example`, and tag-triggered image publishing to GHCR.
- Added the first public merchant integration and deployment guides, smoke-test scripts, and community health files for external adopters.

### Changed
- Switched the web app to runtime API base URL injection so image deployments can change API endpoints without rebuilding frontend assets.
- Documented the initial channel availability baseline: Alipay and Stripe available, WeChat Pay in testing, and PayPal reserved but not yet open.

[v0.1.0-beta.4]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.3...v0.1.0-beta.4
[v0.1.0-beta.3]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.2...v0.1.0-beta.3
[v0.1.0-beta.2]: https://github.com/aaaaaajie/OpenCashier/compare/v0.1.0-beta.1...v0.1.0-beta.2
[v0.1.0-beta.1]: https://github.com/aaaaaajie/OpenCashier/compare/6882a8c...v0.1.0-beta.1
