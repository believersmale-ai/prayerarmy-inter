# Agent readiness - what was added and how to verify it

Everything is generated from your site settings and database, and the domain comes from the request,
so no hostname is hard-coded (the old `YOUR-DOMAIN.com` placeholder is replaced automatically).

| # | Check | Where it lives |
|---|-------|----------------|
| 1 | Content-Signal in robots.txt | `/robots.txt` (api/agent.php). Change under Admin > SEO > "AI & search use of your content". Default: `search=yes, ai-input=yes, ai-train=no` |
| 2 | Sitemap | `/sitemap.xml`: home, about, contact, privacy, terms + every sermon, with lastmod |
| 3 | Real 404 | `ErrorDocument 404` in `.htaccess` -> branded, `noindex` page sent with HTTP 404 |
| 4-6 | Structured data | JSON-LD graph on every page: Organization, Church (hours from weekly schedule), Person, WebSite, WebPage/AboutPage/ContactPage, BreadcrumbList, Event, ItemList + AudioObject/VideoObject, PodcastSeries. `sameAs` comes from your social links |
| 7 | About / contact / legal linked | New `/about` and `/contact` pages, linked from the home footer (privacy and terms were already linked) |
| 8 | llms.txt | `/llms.txt` |
| 9 | Markdown on request | Any page returns Markdown for `Accept: text/markdown`; also `/index.md`, `/about.md`, `/contact.md`, `/privacy.md`, `/terms.md` |
| 10 | Link header | RFC 8288 `Link` on every page (llms.txt, Markdown alternate, sitemap, MCP server card) |
| 11 | WebMCP | `agent-tools.js` registers 6 tools via `navigator.modelContext.registerTool()`; prayer and connect forms carry `toolname` / `tooldescription` |
| 12 | MCP Server Card | `/.well-known/mcp/server-card.json`, pointing at a real read-only MCP server at `/mcp` (Streamable HTTP, 5 tools) |

## Deploy
Upload the files as before (keep `.htaccess` and `api/.htaccess`). New files: `api/agent.php`, `agent-tools.js`.
The static `robots.txt` was removed because it is now generated. Re-run nothing in the database; no schema change.

## Verify after upload (replace with your domain)
```
curl -s https://prayerarmyinternational.com/robots.txt
curl -s -o /dev/null -w "%{http_code}\n" https://prayerarmyinternational.com/no-such-page      # 404
curl -sI https://prayerarmyinternational.com/ | grep -i ^link
curl -s -H "Accept: text/markdown" https://prayerarmyinternational.com/ | head
curl -s https://prayerarmyinternational.com/.well-known/mcp/server-card.json
```
Notes: `sameAs` and the Organization node use whatever social links, address, phone and email are saved in Admin, so
fill those in. The MCP server is read-only on purpose (no prayer submissions through it).
