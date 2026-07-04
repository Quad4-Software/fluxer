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

`setup.sh` creates `.env`, sets the public hostname, and generates every required secret (including VAPID keys). Use `--cloudflare-tunnel` when Cloudflare terminates HTTPS in front of Caddy. Use `--verify` with `--start` to probe health endpoints after launch.

To upgrade an existing deployment (for example from upstream `fluxerapp/fluxer`) to this fork:

```bash
cd deploy/self-hosting   # or your install directory
./upgrade.sh --verify
```

`upgrade.sh` backs up stack files, downloads the latest templates from `Quad4-Software/fluxer`, appends any missing `.env` keys without overwriting your values, generates new secrets such as `FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET`, switches `FLUXER_REGISTRY_OWNER` from `fluxerapp` to `Quad4-Software` when appropriate, then runs `docker compose pull`, `down`, and `up -d` while keeping data volumes. Pass `--no-fork` to keep your current image registry.

If an upgrade goes wrong, roll back stack files from the automatic backup:

```bash
./upgrade.sh restore --list
./upgrade.sh restore latest --verify
```

### Changes in this repository

| Area | Problem | Change |
| --- | --- | --- |
| SeaweedFS S3 auth | Uploads failed with `InvalidAccessKeyId` / `403 Access Denied` because the SeaweedFS container did not receive S3 credentials | Pass `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to the `seaweedfs` service (matching `FLUXER_S3_ACCESS_KEY` / `FLUXER_S3_SECRET_KEY` in `.env`) |
| Instance integrations config | Email and other integration settings saved in the admin panel are stored in `fluxer_kv` and previously overrode `.env` permanently | On self-hosted instances, non-empty environment variables take precedence over stored KV values; integration secrets are not written to KV |
| SeaweedFS init race | `seaweedfs-init` could start before master/filer gRPC was ready | Wait for a SeaweedFS healthcheck, add an initial delay, and retry bucket creation with backoff |
| Media proxy readiness | `media-proxy` had health checks disabled, so Caddy could route traffic before the service was listening | Enable an HTTP `/_health` check and gate Caddy on `media-proxy` being healthy |
| Bot protection | Self-hosted stacks had no captcha by default | ALTCHA proof-of-work captcha is enabled by default (`FLUXER_CAPTCHA_PROVIDER=altcha`); `setup.sh` generates `FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET` |
| SMTP credentials in KV | SMTP passwords were stored in plaintext inside `instance_integrations_config` | Self-hosted deployments keep integration secrets in environment variables only |

### Operator notes

Configure integrations through `.env` when possible. The admin panel remains useful for non-secret settings (for example SMTP host, port, and username).

To reset stored integration config:

```sql
DELETE FROM fluxer_kv
WHERE table_name = 'instance_configuration'
  AND row_key = 'instance_integrations_config';
```

Restart the API and worker containers after changing `.env` or clearing stored config.

When building container images from this repository, set `FLUXER_REGISTRY_OWNER=Quad4-Software` in `deploy/self-hosting/.env` so the stack pulls from your GitHub Container Registry packages.

### CI and releases

Pull requests and pushes to `master` run tests, typecheck, and validation workflows automatically. To build and publish container images to `ghcr.io/Quad4-Software`, run the **release all builds** workflow from the Actions tab.

<p align="center">
  <img src="./fluxer_static/marketing/screenshots/desktop-1920w.png" alt="Fluxer app showcase" width="900">
</p>
