<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./fluxer_static/marketing/branding/logo-white.svg">
    <img src="./fluxer_static/marketing/branding/logo-color.svg" alt="Fluxer logo" width="400">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/Quad4-Software/fluxer">
    <img src="https://img.shields.io/badge/GitHub-Quad4--Software%2Ffluxer-181717" alt="GitHub" /></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-AGPLv3-purple" alt="AGPLv3 License" /></a>
</p>

# Fluxer

Fluxer is a free and open source instant messaging and VoIP chat app built for friends, groups, and communities.

This repository is maintained by [Quad4 Software](https://github.com/Quad4-Software). It is based on [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer) with a focus on reliable self-hosting.

**This is a bleeding-edge fork.** Changes land here quickly and may be less tested than upstream. Problems you hit on this fork may be unrelated to [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer). No support is guaranteed for this repository.

### Disclaimer

This fork is an independent project and is not affiliated with, endorsed by, or associated with [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer) or its maintainers.

This software is provided by Quad4 Software "AS IS", without warranty of any kind, express or implied. Quad4 Software assumes no responsibility or liability for this repository, its operation, or any damages arising from its use. You use this software entirely at your own risk.

Large language models are used to assist with development and fast iteration on concepts. All changes are reviewed by a human. This fork is not intended for public environments with untrusted users. Treat it as experimental software unless you are prepared to operate and secure it yourself.

## Self-hosting

### Quick start

From a fresh server with Docker installed:

```bash
curl -fsSL https://raw.githubusercontent.com/Quad4-Software/fluxer/master/deploy/self-hosting/install.sh | bash -s -- --domain chat.example.com --start
```

From a git checkout:

```bash
cd deploy/self-hosting
./setup.sh --domain chat.example.com --start
```

`setup.sh` creates `.env`, sets the public hostname, and generates every required secret (including VAPID keys). Use `--cloudflare-tunnel` when Cloudflare terminates HTTPS in front of Caddy. Use `--easypwned` to enable offline breached-password checks during setup. Use `--verify` with `--start` to probe health endpoints after launch. For Coolify, use `docker-compose.coolify.yml` (see `fluxer_docs/docs/operator/configuration.md`).

To upgrade an existing deployment (for example from upstream `fluxerapp/fluxer`) to this fork:

```bash
cd deploy/self-hosting   # or your install directory
./upgrade.sh --verify
```

`upgrade.sh` backs up stack files, downloads the latest templates from `Quad4-Software/fluxer`, appends any missing `.env` keys without overwriting your values, generates new secrets such as `FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET`, switches `FLUXER_REGISTRY_OWNER` from `fluxerapp` to `Quad4-Software` when appropriate, then runs `docker compose pull`, `down`, and `up -d` while keeping data volumes. Pass `--no-fork` to keep your current image registry. Pass `--backup-data` to run `./backup-data.sh` before refreshing stack files.

Back up Postgres and S3 object data separately:

```bash
./backup-data.sh
./restore-data.sh latest --dry-run
./restore-data.sh latest --yes
```

Metadata is written to `backups/data/latest-meta.json`. The admin panel **Instance Operations** page reads this file when `./backups/data` is mounted into the admin container.

If an upgrade goes wrong, roll back stack files from the automatic backup:

```bash
./upgrade.sh restore --list
./upgrade.sh restore latest --verify
```

### Changes in this repository

| Area | Problem | Change |
| --- | --- | --- |
| SeaweedFS S3 auth | Uploads failed with `InvalidAccessKeyId` / `403 Access Denied` because the SeaweedFS container did not receive S3 credentials | Pass `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to the `seaweedfs` service (matching `FLUXER_S3_ACCESS_KEY` / `FLUXER_S3_SECRET_KEY` in `.env`) |
| Instance integrations config | Email and other integration settings saved in the admin panel are stored in `fluxer_kv` and previously overrode `.env` permanently | On self-hosted instances, non-empty environment variables take precedence over stored KV values. Integration secrets are not written to KV |
| SeaweedFS init race | `seaweedfs-init` could start before master/filer gRPC was ready | Wait for a SeaweedFS healthcheck, add an initial delay, and retry bucket creation with backoff |
| Media proxy readiness | `media-proxy` had health checks disabled, so Caddy could route traffic before the service was listening | Enable an HTTP `/_health` check and gate Caddy on `media-proxy` being healthy |
| Bot protection | Self-hosted stacks had no captcha by default | ALTCHA proof-of-work captcha is enabled by default (`FLUXER_CAPTCHA_PROVIDER=altcha`). `setup.sh` generates `FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET` |
| Breached-password checks | HIBP API requires outbound HTTPS from the API | Optional [easypwned](https://github.com/easybill/easypwned) (`docker compose --profile easypwned`). Enable with `FLUXER_EASYPWNED_ENABLED=true` or `setup.sh --easypwned` |
| SMTP credentials in KV | SMTP passwords were stored in plaintext inside `instance_integrations_config` | Self-hosted deployments keep integration secrets in environment variables only |
| Data backups | No bundled workflow for Postgres and object storage | `backup-data.sh` and `restore-data.sh` with metadata for the admin Instance Operations page |
| Status page links | Connection delays showed no operator-provided status context | `FLUXER_APP_STATUS_PAGE_URL` and `FLUXER_APP_STATUS_PAGE_INCIDENT_HISTORY_URL` in `.env` or the admin branding settings |
| Error monitoring | No first-party Sentry wiring for self-hosted stacks | Optional Sentry via `FLUXER_SENTRY_ENABLED`, `FLUXER_SENTRY_DSN`, and related `.env` keys |
| Reverse proxy tuning | Default Caddy and Compose settings left headroom on the table | Tuned Caddyfile and Docker resource limits for common self-hosted workloads |
| Admin panel | No dark mode or build provenance for fork operators | Theme toggle in the admin UI. Build commit and repository URL shown for community forks |
| Admin sidebar | Some items appeared incorrectly on self-hosted instances | Sidebar entries respect self-hosted configuration when deciding visibility |
| Deploy assets | Stack scripts and compose files could drift without CI checks | `deploy-validation` in CI validates self-hosting scripts and compose syntax on every push |

### Operator notes

Configure integrations through `.env` when possible. The admin panel remains useful for non-secret settings (for example SMTP host, port, and username).

Set a public status page for connection issues:

```bash
FLUXER_APP_STATUS_PAGE_URL=https://status.example.com
FLUXER_APP_STATUS_PAGE_INCIDENT_HISTORY_URL=https://status.example.com/history
```

Optional Sentry monitoring:

```bash
FLUXER_SENTRY_ENABLED=true
FLUXER_SENTRY_CLIENT_ENABLED=true
FLUXER_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
FLUXER_SENTRY_ENVIRONMENT=production
```

To reset stored integration config:

```sql
DELETE FROM fluxer_kv
WHERE table_name = 'instance_configuration'
  AND row_key = 'instance_integrations_config';
```

Restart the API and worker containers after changing `.env` or clearing stored config.

When building container images from this repository, set `FLUXER_REGISTRY_OWNER=Quad4-Software` in `deploy/self-hosting/.env` so the stack pulls from your GitHub Container Registry packages.

### Development

This fork adds a [Taskfile](https://taskfile.dev/) for common local and CI workflows. Install [Task](https://taskfile.dev/installation/), then run `task --list-all` from the repository root. Useful entry points include `task install`, `task bootstrap`, `task build`, `task test`, and `task validate`.

### CI and releases

Pull requests and pushes to `master` run tests, typecheck, validation, deploy-asset checks, and CodeQL analysis automatically. To build and publish container images to `ghcr.io/Quad4-Software`, run the **release all builds** workflow from the Actions tab.

<p align="center">
  <img src="./fluxer_static/marketing/screenshots/desktop-1920w.png" alt="Fluxer app showcase" width="900">
</p>
