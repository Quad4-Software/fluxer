# Invidious Support Plan

Replace YouTube Data API enrichment and Google iframe playback with Invidious for YouTube link embeds in Fluxer.

Status: planning only (not implemented).

---

## Goals

- Remove dependency on YouTube Data API v3 (no API key, no quota, no Google billing)
- Stop embedding Google's player; use Invidious `/embed/` instead
- Keep accepting normal YouTube URLs (`youtube.com`, `youtu.be`, shorts, etc.) — users should not need to paste Invidious links
- Fit Fluxer's self-hosting model: each instance configures (or runs) its own Invidious instance

## Non-goals (for initial implementation)

- Accepting Invidious URLs directly as user input (nice-to-have later)
- Full Invidious feature parity (subscriptions, comments, search UI)
- YouTube IFrame Player API parity (Invidious has no formal embed JS API)

---

## Current Architecture

YouTube support is split across three layers.

### 1. Link unfurling (`fluxer_unfurl`)

`fluxer_unfurl/src/resolvers/youtube.rs` — `YouTubeResolver`:

- Matches `youtube.com`, `youtu.be`, shorts, embed URLs, `youtube-nocookie.com`, etc.
- **Requires a YouTube Data API v3 key** (`FLUXER_YOUTUBE_API_KEY` or per-instance config via `InstanceConfigRepository`)
- Calls `https://www.googleapis.com/youtube/v3/videos?id=...&part=snippet,player,status`
- Builds a rich embed: title, description, channel author, proxied thumbnail, iframe URL `https://www.youtube.com/embed/{id}?start=...`
- Without an API key: logs `"No YouTube API key configured"` and returns **no embed**

Resolver chain registration: `fluxer_unfurl/src/resolvers/mod.rs`

API key is passed through NATS unfurl service: `fluxer_api/src/api/infrastructure/NatsUnfurlerService.ts`

### 2. Frontend playback (`fluxer_app`)

`fluxer_app/src/features/channel/components/embeds/media/EmbedYouTube.tsx`:

- Click-to-play poster thumbnail, then sandboxed iframe on interaction
- Sets `autoplay=1` and `auto_play=1` on embed URL

Detection is hardcoded to YouTube provider:

- `fluxer_app/src/features/channel/components/embeds/ChannelEmbed.tsx`
- `fluxer_app/src/features/channel/components/embeds/channel_embed/EmbedMediaRenderer.tsx`

```ts
getUrlHostname(embed.provider?.url) === 'www.youtube.com'
```

Display name: `YOUTUBE_PROVIDER_NAME = 'YouTube'` in `fluxer_app/src/features/app/config/I18nDisplayConstants.ts`

URL sanitization strips YouTube tracking params: `fluxer_app/src/features/messaging/utils/UrlSanitizationUtils.ts`

### 3. Instance config / ops

| Area | Location | Notes |
|------|----------|-------|
| Config default | `packages/config/src/ConfigLoader.ts` | `integrations.youtube.api_key` |
| Env override | `packages/config/src/config_loader/EnvironmentOverrides.ts` | `FLUXER_YOUTUBE_API_KEY` |
| Instance schema | `packages/schema/src/domains/instance/InstanceSchemas.ts` | `youtube_enabled` policy |
| Admin UI | `fluxer_admin/src/templates/pages/instance_config.rs` | API key field, service toggle |
| Setup wizard | `fluxer_app/src/features/app/components/setup/` | Step `integration_youtube` |
| Runtime config | `fluxer_app/src/features/app/state/RuntimeConfig.ts` | `youtube_enabled` |
| CSP | `fluxer_app_proxy/src/csp.rs` | `frame-src`: `youtube.com/embed/`; `img-src`: `i.ytimg.com` |

Policy: `youtube_enabled` defaults on when an API key is configured (`InstanceConfigRepository`).

---

## Invidious API Reference

Documentation: https://docs.invidious.io/api/

### Relevant endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/videos/:id` | Full metadata: title, description, author, thumbnails, `lengthSeconds`, etc. |
| `GET /api/v1/resolveurl?url=...` | Parse any YouTube URL → `videoId`, `startTimeSeconds`, etc. |
| `GET /embed/:id` | iframe player (no formal JS API like YouTube IFrame API) |

Optional: `&hl=LANGUAGE` on JSON endpoints for localized fields.

### Embed URL format

```
https://{instance}/embed/{videoId}?autoplay=1&start=90
```

Timestamp parameters (documented): `start`, `t`, `time_continue` — supports seconds (`90`) or duration syntax (`1m30s`).

Other useful player params: `autoplay`, `local`, `quality`, `listen`, `controls`, `loop`, `volume`, `region`.

URL parameters reference: https://docs.invidious.io/url-parameters/

### Metadata field mapping

| Current (YouTube Data API) | Invidious API |
|----------------------------|---------------|
| `snippet.title` | `title` |
| `snippet.description` | `description` |
| `snippet.channel_title` + `channel_id` | `author` + `authorId` |
| `snippet.thumbnails.best()` | `videoThumbnails[]` (pick highest quality) |
| `player.embed_html` dimensions | default 16:9 (1280×720) or derive from thumbnail |
| embed URL | `{instance}/embed/{videoId}` |
| `lengthSeconds` | `lengthSeconds` (available on Invidious; not currently set by YouTube resolver for video media) |

No API key required. Thumbnails are typically `i.ytimg.com` URLs — existing media proxy should still work.

### Example API response shape (`GET /api/v1/videos/:id`)

Key fields for embed building:

```json
{
  "title": "...",
  "videoId": "...",
  "videoThumbnails": [{ "quality": "...", "url": "...", "width": 1280, "height": 720 }],
  "description": "...",
  "author": "...",
  "authorId": "...",
  "authorUrl": "...",
  "lengthSeconds": 212,
  "viewCount": 1234567,
  "liveNow": false,
  "isUpcoming": false
}
```

---

## Proposed Architecture

### High-level flow

1. User pastes `https://youtu.be/dQw4w9WgXcQ` (unchanged)
2. `YouTubeResolver` (or renamed resolver) extracts video ID and timestamp (keep existing URL parsing in `youtube.rs`)
3. Fetch metadata from `{invidious_instance}/api/v1/videos/{id}` instead of Google API
4. Build `MessageEmbed` with Invidious embed URL in `embed.video.url`
5. Frontend renders click-to-play poster, loads Invidious iframe on interaction

### Config changes

Replace or supplement:

```yaml
integrations:
  youtube:
    api_key: ""          # remove eventually
  invidious:
    instance_url: ""     # e.g. https://invidious.example.com
```

Environment variable: `FLUXER_INVIDIOUS_INSTANCE_URL`

Setup wizard: replace "YouTube Data API key" step with "Invidious instance URL".

Policy toggle: rename `youtube_enabled` → `video_embeds_enabled` or repurpose existing name with updated copy.

`effective_available` for the service: `Boolean(invidious_instance_url)` instead of `Boolean(youtube_api_key)`.

### Backend changes (`fluxer_unfurl`)

**Option A — modify `youtube.rs` in place**

- Swap Google API call for Invidious `GET /api/v1/videos/{id}`
- Change embed URL to `{instance}/embed/{id}?start=...`
- Update `embed.provider` (see Provider naming below)
- Keep all existing URL parsing tests

**Option B — new `invidious.rs` resolver**

- Cleaner separation; `youtube.rs` URL parsing could be shared module
- Resolver chain registers Invidious resolver before or instead of YouTube resolver

**ResolveContext changes** (`fluxer_unfurl/src/resolvers/mod.rs`):

- Add `invidious_instance_url: Option<String>`
- Remove or deprecate `youtube_api_key`
- Thread through `NatsUnfurlerService`, `shard_impl.rs`, tests

**Thumbnail enrichment**: unchanged — proxy via `media_proxy.get_metadata()`.

**Embed dimensions**: use 1280×720 default or pick from best thumbnail dimensions (Invidious does not return embed HTML).

### Frontend changes (`fluxer_app`)

**Generalize embed component detection**

Current check breaks when provider is not `www.youtube.com`. Options:

1. Rename `EmbedYouTube` → `EmbedExternalVideo` and detect by embed URL hostname matching configured instance (runtime config would need instance URL exposed to client, or detect generic pattern)
2. Check `embed.video.url` hostname against allowlist
3. Add new provider URL field set to Invidious instance origin

**Provider naming**

- Keep display as "YouTube" (content source) with Invidious as playback backend — less i18n churn
- Or use configurable / generic "Video" label

**Autoplay params**

Invidious uses `autoplay=1` (already compatible). Drop `auto_play=1` (YouTube-specific).

### CSP changes (`fluxer_app_proxy`)

- Add configured Invidious instance origin to `frame-src`
- Consider dynamic CSP source from runtime config (similar to media endpoint pattern in `RuntimeCspSources`)
- Keep `i.ytimg.com` in `img-src` for thumbnails
- Remove `youtube.com/embed/` from `frame-src` if fully migrated

### Deploy / self-hosting (`deploy/self-hosting/`)

Optional Invidious service in `docker-compose.yml` and `docker-compose.coolify.yml`:

- Document RAM requirements (~500 MB–1 GB)
- Wire `FLUXER_INVIDIOUS_INSTANCE_URL` to internal service hostname
- Update `setup.sh` / `upgrade.sh` prompts
- Update `.env.example`

Invidious docker: https://github.com/iv-org/invidious (official compose in repo)

---

## Design Options

### Option 1: Full replacement (recommended)

- Metadata via Invidious API
- Playback via Invidious `/embed/`
- No Google API key anywhere
- Requires reliable per-instance Invidious

### Option 2: Metadata only

- Fetch metadata from Invidious (no API key)
- Playback still via `youtube.com/embed/`
- Removes API key pain but keeps Google tracking on play
- Partial privacy win only

### Option 3: Hybrid transition

- Try Invidious first
- Fall back to YouTube Data API if Invidious fails and API key is configured
- More complex; useful during migration window

### Option 4: Piped instead of Invidious

Piped is the other major privacy YouTube frontend. Worth evaluating before committing.

| | Invidious | Piped |
|---|-----------|-------|
| Metadata API | `GET /api/v1/videos/:id` | `GET /api/v1/streams/:videoId` |
| Embed | `/embed/:id` | `/embed/:videoId` |
| API key | None | None |
| Self-host complexity | Lighter | Heavier (companion services) |
| Public instance health (2026) | Poor | Better |
| SponsorBlock | No | Yes |
| JS required | No | Yes |

If reliability matters more than deployment simplicity, Piped may be the better long-term bet. This plan focuses on Invidious per original request; architecture is largely the same either way.

---

## Caveats and Risks

### 1. Instance reliability (highest risk)

Public Invidious instances have been heavily affected by YouTube IP-level blocking. The official list is short:

https://docs.invidious.io/instances/

Official guidance: **"host at home instead of using a public instance."**

**Do not hardcode a default public instance.** Fluxer instances must configure their own Invidious URL or run one alongside the stack.

### 2. Content edge cases

Invidious may fail where YouTube API succeeds (or vice versa):

- Age-restricted / sign-in-required videos
- Live streams and premieres (`liveNow`, `isUpcoming`)
- Region-blocked content
- Private / unlisted videos
- Videos throttled for the instance's IP

Define fallback UX: plain link card, "video unavailable" message, or open-in-browser action.

### 3. No iframe player API

Invidious has no YouTube IFrame Player API equivalent (open request: https://github.com/iv-org/invidious/issues/3705).

Fluxer only needs click-to-play + autoplay — this is fine. No programmatic seek/volume control needed today.

### 4. CSP and `frame-ancestors`

Some public Invidious instances set restrictive `frame-ancestors` CSP headers. Self-hosted instances you control are fine; arbitrary public instances may block embedding from your domain.

### 5. Operational burden

Self-hosted Invidious requires:

- Periodic image updates (YouTube anti-bot changes break instances until updated)
- Memory management (known leaks; periodic restarts sometimes needed)
- IP rotation / VPN if rate-limited
- No open registration if exposed publicly (abuse burns your YouTube quota)

### 6. Legal / ToS

Instance operators bear platform ToS risk. Document clearly that operators run Invidious at their own discretion. Bundling as optional self-hosted service with private-use defaults mitigates this.

### 7. Thumbnail CDN dependency

Thumbnails still come from `i.ytimg.com` in most cases. Playback is decoupled from Google; preview images may still hit Google CDN unless Invidious proxies them (depends on instance config / `local=true`).

---

## Migration Path

For existing instances with a YouTube API key configured:

1. Add Invidious config alongside YouTube key (transition period)
2. Prefer Invidious when `instance_url` is set
3. Fall back to YouTube API only if configured and Invidious fails (optional)
4. Deprecate `FLUXER_YOUTUBE_API_KEY` with release notes
5. Remove YouTube API code path in a later release

Admin UI: show migration notice when `api_key_set` but no Invidious URL.

---

## Implementation Checklist

### Backend

- [ ] Add `invidious.instance_url` to master config, env overrides, instance config schema
- [ ] Thread `invidious_instance_url` through `ResolveContext` and `NatsUnfurlerService`
- [ ] Implement Invidious metadata fetch in resolver (modify `youtube.rs` or new module)
- [ ] Map Invidious JSON → `MessageEmbed` (title, description, author, thumbnail, video URL)
- [ ] Handle timestamps on embed URL (`start` param)
- [ ] Error handling: Invidious down, 404, rate limit → graceful empty/partial embed
- [ ] Unit tests: API response parsing, thumbnail selection, embed URL building
- [ ] Keep existing YouTube URL parsing tests

### API / Admin

- [ ] Update `InstanceConfigAdminController` integrations response
- [ ] Admin template: Invidious URL field, updated service labels
- [ ] Update `InstanceConfigRepository.getEffectiveInvidiousInstanceUrl()`
- [ ] Schema updates in `packages/schema` (admin + instance domains)
- [ ] Deprecation path for `youtube.api_key`

### Frontend

- [ ] Generalize `EmbedYouTube` detection (not hardcoded to `www.youtube.com`)
- [ ] Update autoplay query params for Invidious
- [ ] Setup wizard: replace API key step with instance URL
- [ ] Update i18n strings (~20 locale files)
- [ ] Expose Invidious instance origin to client if needed for CSP/embed detection

### Infrastructure

- [ ] Dynamic CSP `frame-src` for Invidious instance
- [ ] Optional Invidious service in docker-compose files
- [ ] `setup.sh` / `upgrade.sh` / `.env.example` updates
- [ ] Documentation in self-hosting guide

### Testing

- [ ] Resolver integration test with mock Invidious API
- [ ] Frontend embed render with Invidious provider URL
- [ ] CSP header includes instance origin
- [ ] Setup wizard flow end-to-end
- [ ] Fallback behavior when Invidious unreachable

---

## Open Questions

1. **Invidious vs Piped** — commit to Invidious, support both, or abstract as "YouTube frontend" config?
2. **Provider display name** — keep "YouTube" for users or show "Invidious" / generic "Video"?
3. **Bundle Invidious in compose by default** or opt-in profile?
4. **Expose instance URL to frontend** for embed detection, or encode enough in embed payload server-side?
5. **Transition period** — support both YouTube API and Invidious simultaneously?
6. **Live stream embeds** — attempt support or explicitly disable with clear UX?

---

## References

- Invidious API docs: https://docs.invidious.io/api/
- Invidious URL parameters: https://docs.invidious.io/url-parameters/
- Invidious public instances: https://docs.invidious.io/instances/
- Invidious embed player API request: https://github.com/iv-org/invidious/issues/3705
- Invidious source: https://github.com/iv-org/invidious
- Piped (alternative): https://github.com/TeamPiped/Piped

---

## Files to Touch (estimated)

| File | Change |
|------|--------|
| `fluxer_unfurl/src/resolvers/youtube.rs` | Core resolver logic |
| `fluxer_unfurl/src/resolvers/mod.rs` | Context + chain |
| `fluxer_unfurl/src/shard_impl.rs` | Pass instance URL |
| `fluxer_api/src/api/infrastructure/NatsUnfurlerService.ts` | Pass instance URL |
| `fluxer_api/src/api/instance/InstanceConfigRepository.ts` | Config storage |
| `packages/config/src/ConfigLoader.ts` | Default config |
| `packages/config/src/config_loader/EnvironmentOverrides.ts` | Env var |
| `packages/schema/src/domains/admin/AdminSchemas.ts` | Admin API schema |
| `packages/schema/src/domains/instance/InstanceSchemas.ts` | Instance policy |
| `fluxer_app/.../EmbedYouTube.tsx` | Player + detection |
| `fluxer_app/.../ChannelEmbed.tsx` | Provider check |
| `fluxer_app/.../EmbedMediaRenderer.tsx` | Provider check |
| `fluxer_app/.../setup/*` | Wizard steps |
| `fluxer_admin/src/templates/pages/instance_config.rs` | Admin UI |
| `fluxer_app_proxy/src/csp.rs` | frame-src |
| `deploy/self-hosting/docker-compose*.yml` | Optional service |
| `deploy/self-hosting/setup.sh`, `upgrade.sh` | Setup prompts |
| `deploy/self-hosting/.env.example` | New env var |
