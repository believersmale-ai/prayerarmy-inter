# Academy public homepage — Phase 12 release checklist

## Routes
- `/academy`: public Academy homepage.
- `/academy/learn`: authenticated learner workspace (API remains session-protected).
- `/academy/login/student`, `/academy/login/instructor`, `/academy/login/admin`: role-specific sign-in.
- `GET /api/academy/catalog`: optional public read-only published course catalog.

## Configuration
Set `PAI_ACADEMY_PUBLIC_CATALOG_ENABLED=true` only after confirming migrations and database connectivity. It defaults to off (404). The catalog returns only course ID, title, slug, description and published lesson count. It never exposes lesson content, questions, student records, instructor assignments or unpublished courses.

The existing student, instructor, examination, publishing and certificate feature flags are independent. Do not enable them solely to enable the catalog.

## Release verification
1. Deploy the latest `main` branch to the active Node.js application.
2. Check `/academy` on desktop, tablet and mobile. Check keyboard focus and screen-reader announcements.
3. With the catalog flag off, confirm the page shows a graceful unavailable message and the API returns 404.
4. With the catalog flag on, verify that draft and archived courses are not shown; published courses appear only with safe public fields.
5. Search by course title and description; test no-match and empty catalog states.
6. Check that student sign-in redirects to `/academy/learn`, while unauthorized course APIs still reject access.
7. Confirm all three Academy role sign-in routes and links work, and that no unauthorized instructor or administrator access is possible.
8. Check database errors return 503 without exposing SQL or credentials.

No production deployment, accessibility audit or end-to-end verification is implied by this code change.
