# Backend route compatibility — updated 17 November 2026

Node now supports the existing public-site and admin workflows. PHP remains an independent deployment option. See `NODE-BACKEND-COMPLETION.md` for tests, schema handling and production configuration.

| Workflow | Node routes | Status |
| --- | --- | --- |
| Settings | GET/POST `/api/settings`, GET `/api/rest/v1/site_settings` | MySQL storage and revision checks; security-only tracking field protected |
| Backend detection | GET `/api/runtime`, `/api/health/db` | Runtime, readiness and durable-media status |
| Public forms | GET `/api/form-token`; POST `/api/rest/v1/prayer_requests`, `connect_requests`, `testimonies`, `wall_prayers`, `message_comments` | Signed tokens, rate limits, approval and consent controls |
| Public content | GET `/api/rest/v1/messages`, `testimonies`, `wall_prayers`, `message_comments` | Explicit public field allowlists, bounded queries |
| Prayer voting | POST `/api/rest/v1/rpc/increment_prayed` | Transactional deduplication and network cap |
| Search/analytics | GET `/api/search`; POST `/api/rest/v1/site_events` | Public search; private analytics through manage-content |
| Staff sign-in/out | POST `/api/admin/login`, `/api/verify-passkey`, `/api/admin/logout`; GET `/api/admin/session` | Persistent HttpOnly cookie; role checks per request |
| Staff password | PUT `/api/auth/v1/user` | Own-account password change; other sessions revoked |
| Staff roles/content | POST `/api/functions/v1/admin-users`, `manage-content`, `change-passkey` | All existing dashboard actions implemented |
| Media | POST `/api/upload`; GET `/api/media`; DELETE `/api/media/:filename`; POST `/api/storage/v1/object/list/media` | Permission checks, actual content detection, stable URLs |
| Public resources | `/about`, `/contact`, `/privacy`, `/terms`, `/sitemap.xml`, `/podcast.xml`, `/robots.txt`, `/llms.txt`, page `.md` alternates | Generated from settings/public content |
| Agent resources | `/.well-known/mcp/server-card.json`, `/mcp`, WebMCP | Read-only public tools; bounded validated requests |
| Public members | `/api/public/*`, `/api/admin/membership/*` | Separate account/session model; feature flags and email verification |

Node does not emulate PHP's bearer-token login/refresh endpoint: `admin.js` chooses Node's persistent cookie flow using `/api/runtime`. This is intentional; the two credential types are not interchangeable.

Production rollout remains separate from code completion: verify backups and intended database layout, use Node 22+, configure persistent media storage and optional mail delivery, test staging, then deploy to the confirmed Hostinger target. No deployment or live schema mutation was performed in this session.
