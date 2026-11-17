import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { stat } from "node:fs/promises";
import { check, clean, object, safeLink, route } from "./node-common.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const plain = (value) =>
  clean(value, 10000).replace(/\*\*|\[\[|\]\]|\{\{\w+\}\}/g, "");
const PAGES = {
  home: "/",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
};
const PROTOCOL = "2025-06-18";
export function registerPages(
  app,
  { content, store, root, uploadsDir, getFallbackSettings },
) {
  const origin = (req) => {
    const host = req.get("host") || "localhost";
    check(/^[a-z0-9.[\]:-]+$/i.test(host), 400, "Invalid host");
    return `${req.secure ? "https" : "http"}://${host}`;
  };
  const settings = async () => {
    try {
      return await content.settings();
    } catch {
      return getFallbackSettings();
    }
  };
  const facts = async (req) => {
    const s = await settings(),
      o = origin(req),
      g = object(s.general),
      contact = object(s.contact);
    const abs = (value) => {
      try {
        const url = safeLink(value);
        if (!url) return "";
        const parsed = new URL(url, o);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
      } catch {
        return "";
      }
    };
    return {
      s,
      o,
      abs,
      name: plain(g.churchName) || "Prayer Army International",
      founder: plain(g.founder),
      description: plain(s.seo?.description || s.about?.p1),
      address: plain(contact.address),
      phone: clean(contact.phone, 100),
      email: clean(contact.email, 160),
      logo: abs(
        g.logoUrl || s.media?.logo || "/assets/images/prayer-army-logo.png",
      ),
      image: abs(
        s.seo?.ogImage ||
          s.hero?.bgImage ||
          "/assets/images/prayer-army-logo.png",
      ),
      sameAs: Object.values(object(s.social)).filter(
        (u) => typeof u === "string" && /^https?:\/\//i.test(u),
      ),
    };
  };
  const events = (s) =>
    [s.event, ...(Array.isArray(s.events) ? s.events : [])].filter(
      (e) => e?.title && e.published !== false,
    );
  const sermons = async (limit = 200) => {
    try {
      return await content.publicRows("messages", { limit });
    } catch {
      return [];
    }
  };
  const graph = async (req, page, f) => {
    const { o, s, name, abs } = f,
      url = o + PAGES[page];
    const organization = {
      "@type": "Organization",
      "@id": o + "/#organization",
      name,
      url: o,
      logo: f.logo,
      sameAs: f.sameAs,
    };
    const church = {
      "@type": "Church",
      "@id": o + "/#church",
      name,
      url: o,
      ...(f.address
        ? { address: { "@type": "PostalAddress", streetAddress: f.address } }
        : {}),
      ...(f.phone ? { telephone: f.phone } : {}),
      ...(f.email ? { email: f.email } : {}),
    };
    const out = [
      organization,
      church,
      { "@type": "WebSite", "@id": o + "/#website", name, url: o },
      {
        "@type":
          page === "about"
            ? "AboutPage"
            : page === "contact"
              ? "ContactPage"
              : "WebPage",
        "@id": url + "#webpage",
        url,
        name:
          page === "home"
            ? name
            : `${page[0].toUpperCase() + page.slice(1)} | ${name}`,
        isPartOf: { "@id": o + "/#website" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: o + "/" },
          ...(page === "home"
            ? []
            : [{ "@type": "ListItem", position: 2, name: page, item: url }]),
        ],
      },
    ];
    if (f.founder)
      out.push({
        "@type": "Person",
        "@id": o + "/#founder",
        name: f.founder,
        worksFor: { "@id": organization["@id"] },
      });
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const hours = [];
    for (const w of Array.isArray(s.weekly) ? s.weekly : []) {
      const matches = [
        ...String(w.time || "").matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi),
      ];
      const toTime = (m, ap) => {
        let h = Number(m[1]);
        const min = Number(m[2] || 0),
          suffix = (m[3] || ap || "").toLowerCase();
        if (h > 23 || min > 59 || (suffix && h > 12)) return "";
        if (suffix) h = (h % 12) + (suffix === "pm" ? 12 : 0);
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      };
      if (matches.length < 2) continue;
      const opens = toTime(matches[0], matches[1][3]),
        closes = toTime(matches[1]);
      if (!opens || !closes) continue;
      const day = days.find(
        (d) => d.toLowerCase() === String(w.day).toLowerCase(),
      );
      for (const d of day
        ? [day]
        : String(w.day).toLowerCase() === "every day"
          ? days
          : [])
        hours.push({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: d,
          opens,
          closes,
        });
    }
    if (hours.length) church.openingHoursSpecification = hours;
    if (page === "home") {
      for (const e of events(s)) {
        const start = new Date(e.start);
        if (Number.isNaN(start.getTime())) continue;
        const end = new Date(e.end);
        out.push({
          "@type": "Event",
          name: plain(e.title),
          startDate: start.toISOString(),
          ...(!Number.isNaN(end.getTime())
            ? { endDate: end.toISOString() }
            : {}),
          description: plain(e.description),
          url: abs(e.link || "/#events"),
          ...(e.venue || f.address
            ? {
                location: {
                  "@type": "Place",
                  name: plain(e.venue || f.address),
                },
              }
            : {}),
        });
      }
      const messages = await sermons(20);
      out.push(
        {
          "@type": "ItemList",
          name: "Sermons",
          itemListElement: messages.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": m.media_type === "audio" ? "AudioObject" : "VideoObject",
              name: m.title,
              description: plain(m.description),
              url: `${o}/?m=${encodeURIComponent(m.id)}`,
              ...(m.media_url ? { contentUrl: abs(m.media_url) } : {}),
              ...(m.created_at ? { uploadDate: m.created_at } : {}),
            },
          })),
        },
        {
          "@type": "PodcastSeries",
          name: name + " — Messages",
          url: o + "/podcast.xml",
        },
      );
    }
    return { "@context": "https://schema.org", "@graph": out };
  };
  const links = (req, res, page) => {
    const o = origin(req),
      md = page === "home" ? "index" : page;
    res.setHeader(
      "Link",
      `<${o}/llms.txt>; rel="describedby"; type="text/plain", <${o}/${md}.md>; rel="alternate"; type="text/markdown", <${o}/sitemap.xml>; rel="sitemap"; type="application/xml", <${o}/.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"`,
    );
    res.vary("Accept");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  };
  const markdownPreferred = (req) => {
    const entries = String(req.get("accept") || "")
      .toLowerCase()
      .split(",")
      .map((part) => {
        const [mime, ...params] = part.trim().split(";");
        const q = params.find((p) => p.trim().startsWith("q="));
        return [mime, q ? Number(q.trim().slice(2)) : 1];
      });
    const md = entries.find(([m]) => m === "text/markdown")?.[1] || 0;
    const html = entries.find(([m]) => m === "text/html")?.[1] || 0;
    return md > 0 && md >= html;
  };
  const markdown = async (req, page, f) => {
    if (["privacy", "terms"].includes(page)) {
      const html = await readFile(join(root, page + ".html"), "utf8");
      return (
        html
          .replace(
            /<(head|script|style|nav|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi,
            "",
          )
          .replace(
            /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
            (_, n, text) =>
              "\n\n" + "#".repeat(Number(n)) + " " + text + "\n\n",
          )
          .replace(/<li\b[^>]*>/gi, "\n- ")
          .replace(/<\/?(?:p|div|main|section|ul|ol|br)\b[^>]*>/gi, "\n\n")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n\s*\n\s*\n/g, "\n\n")
          .trim() + "\n"
      );
    }
    const { s, o, name } = f;
    const lines = [
      `# ${page === "home" ? name : page === "about" ? "About " + name : "Contact " + name}`,
      "",
      plain(s.general?.slogan),
      "",
    ];
    if (page !== "contact") {
      lines.push(
        plain(s.about?.p1),
        "",
        plain(s.about?.p2),
        "",
        `Founder: ${f.founder}`,
        "",
      );
      for (const [title, key] of [
        ["Mission", "missionText"],
        ["Vision", "visionText"],
        ["Our story", "storyText"],
      ])
        if (s.foundation?.[key])
          lines.push("## " + title, "", plain(s.foundation[key]), "");
    }
    lines.push(
      "## Contact",
      "",
      f.address,
      f.phone,
      f.email,
      "",
      `Prayer request: ${o}/#prayer`,
      `Connect: ${o}/#connect`,
      "",
    );
    if (page === "home") {
      lines.push(
        "## Events",
        "",
        ...events(s).map(
          (e) => `- ${plain(e.title)} — ${plain(e.dates || e.start)}`,
        ),
        "",
        "## Latest messages",
        "",
        ...(await sermons(10)).map(
          (m) => `- [${plain(m.title)}](${o}/?m=${encodeURIComponent(m.id)})`,
        ),
      );
    }
    for (const [key, path] of Object.entries(PAGES))
      lines.push(`- [${key}](${o}${path})`);
    return lines.join("\n") + "\n";
  };
  const shell = (title, body, f) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | ${escape(f.name)}</title><meta name="description" content="${escape(f.description)}"><link rel="stylesheet" href="/styles.css"><style>main{max-width:960px;margin:auto;padding:6rem 1.5rem}p{white-space:pre-line}nav{display:flex;gap:1rem;padding:1.5rem}article{margin:2rem 0}</style></head><body><nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav><main><h1>${escape(title)}</h1>${body}</main><script src="/agent-tools.js" defer></script></body></html>`;
  const page = route(async (req, res) => {
    if (req.path !== "/" && req.path.endsWith("/"))
      return res.redirect(301, req.path.replace(/\/$/, ""));
    const path = req.path.replace(/\/$/, "") || "/";
    const page =
      path === "/" || path === "/index.html" || path === "/index.md"
        ? "home"
        : path.replace(/^\//, "").replace(/\.md$/, "");
    const f = await facts(req);
    links(req, res, page);
    if (req.path.endsWith(".md") || markdownPreferred(req))
      return res.type("text/markdown").send(await markdown(req, page, f));
    let html;
    if (page === "about")
      html = shell(
        "About " + f.name,
        `<p>${escape(plain(f.s.about?.p1))}</p><p>${escape(plain(f.s.about?.p2))}</p><h2>${escape(f.founder)}</h2><p>${escape(plain(f.s.foundation?.founderBio))}</p>` +
          ["mission", "vision", "values", "story"]
            .map(
              (key) =>
                `<article><h2>${escape(plain(f.s.foundation?.[key + "Title"] || key))}</h2><p>${escape(plain(f.s.foundation?.[key + "Text"]))}</p></article>`,
            )
            .join(""),
        f,
      );
    else if (page === "contact")
      html = shell(
        "Contact",
        `<p>${escape(f.address)}</p><p>${escape(f.phone)}</p><p>${escape(f.email)}</p><p><a href="/#prayer">Send a prayer request</a></p><p><a href="/#connect">Connect with us</a></p>`,
        f,
      );
    else
      html = await readFile(
        join(root, page === "home" ? "index.html" : page + ".html"),
        "utf8",
      );
    html = html.replaceAll("https://YOUR-DOMAIN.com", f.o);
    if (page === "home") {
      const set = (pattern, value) => {
        html = html.replace(
          pattern,
          (_, prefix, suffix) => prefix + escape(value) + suffix,
        );
      };
      if (f.s.seo?.title) {
        html = html.replace(
          /<title>[\s\S]*?<\/title>/,
          () => `<title>${escape(f.s.seo.title)}</title>`,
        );
        for (const key of ['property="og:title"', 'name="twitter:title"'])
          set(new RegExp(`(<meta ${key} content=")[^"]*(")`), f.s.seo.title);
      }
      if (f.description)
        for (const key of [
          'name="description"',
          'property="og:description"',
          'name="twitter:description"',
        ])
          set(new RegExp(`(<meta ${key} content=")[^"]*(")`), f.description);
      if (f.image)
        for (const key of ['property="og:image"', 'name="twitter:image"'])
          set(new RegExp(`(<meta ${key} content=")[^"]*(")`), f.image);
    }
    const jsonld = `<script type="application/ld+json">${JSON.stringify(await graph(req, page, f)).replace(/</g, "\\u003c")}</script>`;
    html = html.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
      "",
    );
    html = html.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, "");
    html = html.replace(
      "</head>",
      () =>
        `<link rel="canonical" href="${escape(f.o + PAGES[page])}"><link rel="alternate" type="text/markdown" href="/${page === "home" ? "index" : page}.md">${jsonld}</head>`,
    );
    res.type("html").send(html);
  });
  app.get(
    [
      "/",
      "/index.html",
      "/about",
      "/contact",
      "/privacy",
      "/terms",
      "/index.md",
      "/about.md",
      "/contact.md",
      "/privacy.md",
      "/terms.md",
    ],
    page,
  );
  app.get(["/about/", "/contact/", "/privacy/", "/terms/"], (req, res) =>
    res.redirect(301, req.path.replace(/\/$/, "")),
  );
  app.get(
    "/robots.txt",
    route(async (req, res) => {
      const s = await settings(),
        candidate = clean(s.seo?.contentSignals, 100),
        signals =
          /^(search|ai-input|ai-train)=(yes|no)(\s*,\s*(search|ai-input|ai-train)=(yes|no))*$/.test(
            candidate,
          )
            ? candidate
            : "search=yes, ai-input=yes, ai-train=no";
      res
        .type("text")
        .send(
          `User-agent: *\nContent-Signal: ${signals}\nAllow: /\nDisallow: /admin\nDisallow: /manage\nDisallow: /portal\nDisallow: /member\nDisallow: /church\nDisallow: /api/\n\nSitemap: ${origin(req)}/sitemap.xml\n`,
        );
    }),
  );
  app.get(
    ["/sitemap.xml", "/api/sitemap.xml"],
    route(async (req, res) => {
      const o = origin(req),
        rows = await sermons(500);
      const urls = [
        ...Object.values(PAGES).map((path) => ({ url: o + path })),
        ...rows.map((m) => ({
          url: `${o}/?m=${encodeURIComponent(m.id)}`,
          date: String(m.created_at).slice(0, 10),
        })),
      ];
      res
        .type("application/xml")
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            urls
              .map(
                (u) =>
                  `<url><loc>${escape(u.url)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(u.date || "") ? `<lastmod>${u.date}</lastmod>` : ""}</url>`,
              )
              .join("") +
            "</urlset>",
        );
    }),
  );
  app.get(
    ["/podcast.xml", "/api/podcast-feed", "/api/functions/v1/podcast-feed"],
    route(async (req, res) => {
      const f = await facts(req),
        rows = await content.publicRows("messages", { limit: 200 });
      const mimes = {
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
      };
      const items = [];
      for (const m of rows.filter(
        (m) => m.media_type === "audio" && m.media_url,
      )) {
        const url = f.abs(m.media_url);
        if (!/^https?:\/\//i.test(url)) continue;
        const parsed = new URL(url);
        let size = 0;
        if (
          parsed.origin === f.o &&
          /^\/(assets\/uploads|uploads)\/[^/]+$/.test(parsed.pathname)
        ) {
          const filename = decodeURIComponent(basename(parsed.pathname));
          const target = resolve(uploadsDir, filename);
          if (target.startsWith(resolve(uploadsDir) + sep))
            size = (await stat(target).catch(() => null))?.size || 0;
        }
        const date = new Date(m.created_at);
        items.push(
          `<item><title>${escape(m.title)}</title><description>${escape(m.description)}</description><guid isPermaLink="false">${escape(m.id)}</guid>${Number.isNaN(date.getTime()) ? "" : `<pubDate>${date.toUTCString()}</pubDate>`}<enclosure url="${escape(url)}" length="${size}" type="${mimes[extname(parsed.pathname).toLowerCase()] || "audio/mpeg"}"/></item>`,
        );
      }
      res
        .type("application/rss+xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${escape(f.name)} — Messages</title><link>${escape(f.o)}</link><description>${escape(f.description)}</description><language>en</language><itunes:author>${escape(f.name)}</itunes:author><itunes:explicit>false</itunes:explicit>${items.join("")}</channel></rss>`,
        );
    }),
  );
  app.get(
    "/llms.txt",
    route(async (req, res) => {
      const f = await facts(req);
      res.type("text").send(
        `# ${f.name}\n\n${f.description}\n\n${Object.entries(PAGES)
          .map(([name, path]) => `- [${name}](${f.o}${path})`)
          .join(
            "\n",
          )}\n- [Markdown](${f.o}/index.md)\n- [Podcast](${f.o}/podcast.xml)\n- [MCP server card](${f.o}/.well-known/mcp/server-card.json)\n`,
      );
    }),
  );
  const tools = [
    {
      name: "get_organization_info",
      description: "Public church contact information and social profiles",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_site",
      description: "Search public sermons, events and ministry information",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      name: "list_sermons",
      description: "Latest public sermons",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      },
    },
    {
      name: "get_events_and_services",
      description: "Published events and weekly service times",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_giving_info",
      description: "Public giving information",
      inputSchema: { type: "object", properties: {} },
    },
  ].map((t) => ({ ...t, annotations: { readOnlyHint: true } }));
  const toolCall = async (req, name, args) => {
    check(
      tools.some((t) => t.name === name),
      400,
      "Unknown tool",
    );
    const f = await facts(req);
    if (name === "get_organization_info")
      return {
        name: f.name,
        description: f.description,
        founder: f.founder,
        address: f.address,
        phone: f.phone,
        email: f.email,
        sameAs: f.sameAs,
        website: f.o,
      };
    if (name === "search_site") {
      check(typeof args.query === "string", 400, "query is required");
      return content.searchData(args.query);
    }
    if (name === "list_sermons") {
      check(
        args.limit === undefined ||
          (Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= 50),
        400,
        "limit must be 1–50",
      );
      return {
        sermons: await content.publicRows("messages", {
          limit: args.limit || 10,
        }),
      };
    }
    if (name === "get_events_and_services")
      return {
        events: events(f.s),
        weekly: Array.isArray(f.s.weekly) ? f.s.weekly : [],
      };
    return { giving: object(f.s.giving), page: f.o + "/#give" };
  };
  app.get(
    "/.well-known/mcp/server-card.json",
    route(async (req, res) => {
      const f = await facts(req);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.json({
        name: new URL(f.o).hostname.split(".").reverse().join(".") + "/website",
        title: f.name,
        version: "1.0.0",
        protocolVersion: PROTOCOL,
        endpoint: f.o + "/mcp",
        transport: { type: "streamable-http", endpoint: f.o + "/mcp" },
        authentication: { required: false },
        tools,
      });
    }),
  );
  app.all(
    "/mcp",
    route(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Accept,MCP-Protocol-Version",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "OPTIONS") return res.status(204).end();
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res
          .status(405)
          .json({ error: "Use POST for this read-only MCP endpoint" });
      }
      await store.rate(req, "mcp", 240, 600);
      const body = req.body,
        batch = Array.isArray(body),
        requests = batch ? body : [body];
      const replies = [];
      if (batch && (!body.length || body.length > 20))
        return res
          .status(400)
          .json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Invalid Request" },
          });
      for (const request of requests) {
        if (
          !request ||
          typeof request !== "object" ||
          Array.isArray(request) ||
          request.jsonrpc !== "2.0" ||
          typeof request.method !== "string" ||
          (Object.hasOwn(request, "id") &&
            request.id !== null &&
            !["string", "number"].includes(typeof request.id)) ||
          (request.params !== undefined &&
            (!request.params ||
              typeof request.params !== "object" ||
              Array.isArray(request.params)))
        ) {
          replies.push({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Invalid Request" },
          });
          continue;
        }
        if (!Object.hasOwn(request, "id")) continue;
        const id =
          typeof request.id === "string" ||
          typeof request.id === "number" ||
          request.id === null
            ? request.id
            : null;
        let result;
        if (request.method === "initialize")
          result = {
            protocolVersion: PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "church-website", version: "1.0.0" },
          };
        else if (request.method === "ping") result = {};
        else if (request.method === "tools/list") result = { tools };
        else if (request.method === "tools/call") {
          try {
            const data = await toolCall(
              req,
              request.params?.name,
              object(request.params?.arguments),
            );
            result = {
              content: [{ type: "text", text: JSON.stringify(data) }],
              structuredContent: data,
              isError: false,
            };
          } catch (error) {
            result = {
              content: [
                {
                  type: "text",
                  text: error.status
                    ? error.message
                    : "Service temporarily unavailable",
                },
              ],
              isError: true,
            };
          }
        } else {
          replies.push({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not found" },
          });
          continue;
        }
        replies.push({ jsonrpc: "2.0", id, result });
      }
      if (!replies.length) return res.status(202).end();
      res.json(batch ? replies : replies[0]);
    }),
  );
  return {
    notFound: route(async (req, res) => {
      const f = await facts(req);
      res
        .status(404)
        .set("X-Robots-Tag", "noindex")
        .type("html")
        .send(
          shell(
            "Page not found",
            '<p>This page could not be found.</p><a href="/">Return home</a>',
            f,
          ),
        );
    }),
  };
}
