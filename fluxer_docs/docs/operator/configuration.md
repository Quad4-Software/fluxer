# Configuration

Configure your self-hosted Fluxer instance through `.env`, the admin panel, and optional deployment variants.

## Environment variables

The stack reads configuration from `deploy/self-hosting/.env`. Run `./setup.sh` to generate secrets and set `FLUXER_DOMAIN`.

Common variables:

| Variable | Purpose |
| --- | --- |
| `FLUXER_DOMAIN` | Public hostname (for example `chat.example.com`) |
| `FLUXER_PUBLIC_SCHEME` | `https` or `http` |
| `FLUXER_REGISTRY_OWNER` | Image registry owner (`Quad4-Software` for this fork) |
| `FLUXER_IMAGE_TAG` | Image tag to pull (default `v1`) |
| `FLUXER_CADDY_SITE_ADDRESS` | Caddy site bind address (default `:443` for direct TLS) |
| `FLUXER_EMAIL_*` | SMTP settings when email is enabled |
| `FLUXER_APP_STATUS_PAGE_URL` | Public status page URL shown during connection delays |
| `FLUXER_APP_STATUS_PAGE_INCIDENT_HISTORY_URL` | Optional incident history URL |
| `FLUXER_EASYPWNED_ENABLED` | Use local [easypwned](https://github.com/easybill/easypwned) instead of the public HIBP API |
| `FLUXER_EASYPWNED_URL` | Internal easypwned base URL (default `http://easypwned:3342`) |
| `FLUXER_EASYPWNED_FAIL_OPEN` | Allow passwords when easypwned is unreachable (`true` by default) |
| `FLUXER_AUTO_UPDATE_ENABLED` | Run the optional `fluxer-updater` service for Fluxer application images |
| `FLUXER_AUTO_UPDATE_POLL_INTERVAL` | Seconds between registry checks when auto-update is enabled (default `86400`) |

Integration secrets (SMTP password, S3 keys, API keys) should live in `.env` on self-hosted instances. The admin panel is best for non-secret settings.

See `deploy/self-hosting/.env.example` for the full list.

## Offline breached-password checks (easypwned)

By default, Fluxer checks new passwords against the public [Have I Been Pwned](https://haveibeenpwned.com/) k-anonymity API. That requires outbound HTTPS from the API container.

For air-gapped or privacy-focused self-hosting, you can run [easypwned](https://github.com/easybill/easypwned) inside the stack. easypwned ships a local bloom filter of known breached passwords and exposes a small HTTP API. Only SHA-1 hashes are sent to easypwned; plaintext passwords never leave the API process.

1. Run setup with easypwned enabled, or set in `.env`:
   - `FLUXER_EASYPWNED_ENABLED=true`
   - `FLUXER_EASYPWNED_URL=http://easypwned:3342`
2. Start the optional service profile:
   ```bash
   docker compose --profile easypwned up -d
   ```
   Or use `./setup.sh --easypwned --domain chat.example.com --start`.

The easypwned image is large (~1 GB bloom filter). Leave the profile off if you prefer the public HIBP API or do not need breached-password checks.

Set `FLUXER_EASYPWNED_FAIL_OPEN=false` for strict mode: registration and password changes fail when easypwned is unavailable.

## Automatic container updates

By default, Fluxer does not pull or restart containers on its own. Operators upgrade with `docker compose pull` and `docker compose up -d`, or by running `./upgrade.sh`.

To let the stack update Fluxer application images automatically when a newer image is published for `FLUXER_IMAGE_TAG` (for example the moving `v1` tag):

1. Run setup with auto-update enabled, or set in `.env`:
   - `FLUXER_AUTO_UPDATE_ENABLED=true`
   - `FLUXER_AUTO_UPDATE_POLL_INTERVAL=86400` (optional; seconds between checks)
2. Start the optional service profile:
   ```bash
   docker compose --profile auto-update up -d
   ```
   Or use `./setup.sh --auto-update --domain chat.example.com --start`.

The updater is a small Fluxer service (`fluxer-updater`) that reads `docker-compose.yml` from the mounted stack directory, finds services labeled `fluxer.auto_update=true`, pulls each image, and recreates containers one at a time when the image changed. Infrastructure images pinned by digest in `docker-compose.yml` (Postgres, Caddy, NATS, and so on) are not labeled and are left alone.

The updater does not refresh stack files from git; run `./upgrade.sh` when `docker-compose.yml`, Caddy routing, or other deployment files change.

Pin `FLUXER_IMAGE_TAG` to a specific release if you do not want automatic image updates.

## Admin panel

Open `https://your-domain/admin` after the first account registers. Instance configuration under **Instance Config** covers:

- Branding (product name, icons, theme color)
- Status page URLs (leave empty on self-hosted to hide SaaS status links)
- Registration mode, SSO, integrations, and limits

## External reverse proxy

By default, Caddy in the Compose stack terminates TLS and routes all traffic. If you already run nginx, Traefik, Caddy on the host, or Cloudflare Tunnel, forward traffic to the internal Caddy container instead of publishing ports 80/443 twice.

### Architecture

```
Internet -> your reverse proxy -> Caddy (fluxer network) -> api / gateway / app-proxy / ...
```

Caddy remains the internal router. Your external proxy only needs to reach Caddy.

### Direct Docker Compose

1. Stop publishing host ports on Caddy if your proxy shares the same host. In `docker-compose.yml`, remove or comment out the `ports:` block under `caddy` if another service owns 80/443.
2. Set `FLUXER_CADDY_SITE_ADDRESS=:80` in `.env` when the external proxy handles TLS and forwards plain HTTP to Caddy.
3. Set `FLUXER_PUBLIC_SCHEME=https` and `FLUXER_PUBLIC_PORT=443` so generated URLs stay correct.
4. Ensure your proxy forwards these headers to Caddy:
   - `Host`
   - `X-Forwarded-For` (or the header named in `FLUXER_CLIENT_IP_HEADER_NAME`)
   - `X-Forwarded-Proto`
5. WebSocket upgrades must pass through for `/gateway` (long-lived connections).
6. Allow large request bodies for `/api` and `/media` (50 MB API limit in the bundled Caddyfile).

### Cloudflare Tunnel

Use `./setup.sh --cloudflare-tunnel` or set `FLUXER_CADDY_SITE_ADDRESS=:80` and route the tunnel to `caddy:80` inside the Compose network. Cloudflare terminates TLS; Caddy serves HTTP internally.

### nginx example

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Map host port `8080` to the Caddy container (`8080:80` in Compose) or proxy to the container IP on the `fluxer` bridge network.

### Voice and video

LiveKit WebRTC still needs direct access to `7881/tcp` and `7882/udp` on the host. HTTP signaling goes through Caddy at `/livekit/*`; media ports cannot be proxied through a standard HTTP reverse proxy.

## Coolify

For [Coolify](https://coolify.io/) deployments, use `docker-compose.coolify.yml` instead of `docker-compose.yml`:

- Traefik (managed by Coolify) terminates TLS and forwards to Caddy on port 80.
- Caddy joins the external `coolify` proxy network.
- Caddyfile and LiveKit config are embedded as Compose `configs:` (no bind mounts).

In Coolify, set the Caddy service domain to `https://YOUR.DOMAIN:80`. The `:80` suffix tells Traefik which internal port to target.

WebRTC ports `7881/tcp` and `7882/udp` must still be published and opened in your firewall.

```bash
docker compose -f docker-compose.coolify.yml up -d
```

## Status page URLs

Self-hosted instances do not show Fluxer SaaS status links by default. To show your own status page during slow connections or outages:

1. Set `FLUXER_APP_STATUS_PAGE_URL` in `.env`, or
2. Configure **Status page URL** in the admin panel under Instance Config.

Leave both empty to hide the "Connection issues?" prompt on the splash screen.

The status page must expose Instatus-compatible JSON at `/summary.json` and `/components.json` if you want incident and maintenance banners in the client.
