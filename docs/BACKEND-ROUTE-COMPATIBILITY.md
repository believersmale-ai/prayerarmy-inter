# Backend compatibility inventory — 2026-11-16

This is a source-level inventory, not a claim that the routes work in production.

| Frontend caller | Requested endpoint | Node server support | Action |
| --- | --- | --- | --- |
| script.js settings loader | GET /api/rest/v1/site_settings | Missing | Branch now prefers GET /api/settings; PHP fallback retained |
| script.js formToken | GET /api/form-token | Missing | Implement compatible token issuance/validation before public-form rollout |
| script.js prayer form | POST /api/rest/v1/prayer_requests | Present | Validate field contract and token behavior |
| script.js connection form | POST /api/rest/v1/connect_requests | Present | Validate field contract and token behavior |
| script.js sermon library | GET /api/rest/v1/messages | Missing | Audit schema/data; implement read-only list |
| script.js comments | GET/POST /api/rest/v1/message_comments | Missing | Add moderation and rate limits |
| script.js testimonies | GET/POST /api/rest/v1/testimonies | Missing | Preserve approval/privacy checks |
| script.js prayer wall | GET/POST /api/rest/v1/wall_prayers | Missing | Preserve approval/privacy checks |
| script.js prayer counter | POST /api/rest/v1/rpc/increment_prayed | Missing | Enforce anti-abuse rules |
| script.js analytics | POST /api/rest/v1/site_events | Missing | Decide on privacy/retention |
| script.js podcast copy | GET /podcast.xml | Missing | Use verified published audio records |
| admin.js login | POST /api/auth/v1/token | Missing | Do not blindly alias to Node login: response/session model differs |
| admin.js refresh | POST /api/auth/v1/token | Missing | Need secure refresh/session strategy |
| admin.js privileged functions | POST /api/functions/v1/* | Missing | Role authorization and data models required |
| admin.js media list | POST /api/storage/v1/object/list/media | Missing | Use compatible durable media storage |

## Immediate implementation order
1. Verify production backup and inventory existing MySQL tables/records (read-only). PHP and Node schemas may not match.
2. Write endpoint contract tests and verify Node/PHP behavior in staging.
3. Implement form-token compatibility and public content reads without breaking existing writes.
4. Reconcile admin authentication and permissions, then editing and media workflows.
5. Generate podcast feed from approved audio records, then test XML validity.
6. Confirm uploads and settings survive restart/redeployment before approving production deployment.

## Non-negotiable safeguards
No production database migrations, user account resets, .htaccess edits, direct hbuilds/current modifications, or replacement of /blog until backups and tests are verified. Preserve church branding and current public UI.
