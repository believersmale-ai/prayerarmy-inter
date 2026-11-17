import nodemailer from "nodemailer";
import { sameOrigin } from "./node-auth.js";
import { timingSafeEqual } from "node:crypto";
import { readdir } from "node:fs/promises";
import {
  check,
  clean,
  required,
  optional,
  object,
  validEmail,
  utc,
  hmac,
  safeLink,
  rowView,
  route,
} from "./node-common.js";
const TABLES = {
  messages: "site_content_messages",
  testimonies: "site_content_testimonies",
  wall_prayers: "site_content_wall_prayers",
  message_comments: "site_content_message_comments",
};
const FIELDS = {
  messages:
    "id,title,description,link,media_url,media_type,notes_url,source,speaker,category,thumbnail_url,is_featured,created_at",
  testimonies:
    "id,IF(show_name=1,name,'Anonymous') AS name,location,testimony,created_at",
  wall_prayers: "id,name,request,prayed_count",
  message_comments: "id,message_id,name,comment,created_at",
};
const limitOf = (value, fallback, max) =>
  Number.isFinite(Number(value)) && value !== undefined
    ? Math.min(max, Math.max(1, Math.floor(Number(value))))
    : fallback;
const safeId = (value) => {
  const id = clean(value, 64);
  check(/^[a-zA-Z0-9_-]{1,64}$/.test(id), 400, "Invalid record ID");
  return id;
};
export function createContent(store, staff, getSettings, uploadsDir) {
  const { query, one, insert, transaction, config, updateConfig, rate } = store;
  const settings = async () => {
    const { settings } = await getSettings();
    const out = { ...settings };
    delete out.passkey;
    delete out.notifications;
    return out;
  };
  const formToken = route(async (req, res) => {
    const ts = String(Math.floor(Date.now() / 1000));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      token: `${ts}.${hmac((await config()).formSecret, `form|${ts}`).slice(0, 32)}`,
    });
  });
  const formGuard = route(async (req, res, next) => {
    if (req.body?.website) return res.status(201).end();
    const token = req.body?._ft;
    const match =
      typeof token === "string" && token.match(/^(\d{9,11})\.([a-f0-9]{32})$/);
    const age = match ? Math.floor(Date.now() / 1000) - Number(match[1]) : -1;
    check(
      match && age >= 2 && age <= 14400,
      400,
      "Please refresh the page and try again.",
    );
    const signature = hmac(
      (await config()).formSecret,
      `form|${match[1]}`,
    ).slice(0, 32);
    check(
      timingSafeEqual(Buffer.from(signature), Buffer.from(match[2])),
      400,
      "Please refresh the page and try again.",
    );
    next();
  });
  const publicRows = async (resource, args = {}) => {
    check(TABLES[resource], 404, "Not found");
    const max =
      resource === "messages"
        ? 500
        : resource === "message_comments"
          ? 5000
          : resource === "testimonies"
            ? 50
            : 100;
    const limit = limitOf(
      args.limit,
      resource === "messages"
        ? 200
        : resource === "testimonies"
          ? 12
          : resource === "wall_prayers"
            ? 24
            : 5000,
      max,
    );
    const dir = String(args.order || "").endsWith(".asc") ? "ASC" : "DESC";
    let where = ["testimonies", "wall_prayers"].includes(resource)
      ? " WHERE is_approved=1"
      : "";
    const params = [];
    if (resource === "message_comments" && args.message_id) {
      where = " WHERE message_id=?";
      params.push(clean(String(args.message_id).replace(/^eq\./, ""), 64));
    }
    return (
      await query(
        `SELECT ${FIELDS[resource]} FROM ${TABLES[resource]}${where} ORDER BY created_at ${dir} LIMIT ${limit}`,
        params,
      )
    ).map(rowView);
  };
  const notify = async (event, subject) => {
    try {
      const prefs = (await config()).notifications || {};
      if (!prefs[event] || !validEmail(prefs.email || "")) return;
      if (!process.env.PAI_SMTP_HOST || !process.env.PAI_MAIL_FROM) {
        console.error("Notification delivery is not configured");
        return;
      }
      const transport = nodemailer.createTransport({
        host: process.env.PAI_SMTP_HOST,
        port: Number(process.env.PAI_SMTP_PORT || 587),
        secure: Number(process.env.PAI_SMTP_PORT || 587) === 465,
        requireTLS:
          process.env.NODE_ENV === "production" &&
          Number(process.env.PAI_SMTP_PORT || 587) !== 465,
        ...(process.env.PAI_SMTP_USER
          ? {
              auth: {
                user: process.env.PAI_SMTP_USER,
                pass: process.env.PAI_SMTP_PASS,
              },
            }
          : {}),
        connectionTimeout: 5000,
        socketTimeout: 10000,
      });
      await transport.sendMail({
        from: process.env.PAI_MAIL_FROM,
        to: prefs.email,
        subject,
        text: "A new submission is awaiting review. Sign in to the website admin dashboard to view it. Private submission text is never included in this email.",
      });
    } catch (error) {
      console.error("Notification delivery failed:", error.code || error.name);
    }
  };
  const publicPost = (resource) =>
    route(async (req, res) => {
      const b = object(req.body);
      const kinds = {
        prayer_requests: ["prayer", 20],
        connect_requests: ["connect", 20],
        message_comments: ["comments", 20],
        testimonies: ["testimonies", 10],
        wall_prayers: ["wall", 20],
      };
      check(kinds[resource], 404, "Not found");
      await rate(req, ...kinds[resource]);
      let table, data, event, subject;
      if (resource === "prayer_requests") {
        const contact = clean(b.contact, 255);
        table = "prayer_requests";
        data = {
          name: required(b.name, 120, "Name"),
          request: required(b.request, 4000, "Request"),
          email: optional(
            b.email || (contact.includes("@") ? contact : ""),
            255,
          ),
          phone: optional(
            b.phone || (!contact.includes("@") ? contact : ""),
            50,
          ),
          is_private:
            b.is_private === true ||
            b.is_private === "true" ||
            b.is_private === 1
              ? 1
              : 0,
          created_at: utc(),
        };
        event = "onPrayer";
        subject = "New prayer request received";
      } else if (resource === "connect_requests") {
        const email = optional(b.email, 160),
          phone = optional(b.phone, 40);
        check(email || phone, 400, "Phone or email is required");
        check(!email || validEmail(email), 400, "Enter a valid email address");
        table = "connect_requests";
        data = {
          name: required(b.name, 120, "Name"),
          email,
          phone,
          subject: [
            "visitor",
            "callback",
            "question",
            "volunteer",
            "counseling",
            "other",
          ].includes(b.kind)
            ? b.kind
            : "visitor",
          message: optional(b.note || b.message, 2000),
          created_at: utc(),
        };
        event = "onConnect";
        subject = "New visitor enquiry";
      } else if (resource === "message_comments") {
        table = TABLES.message_comments;
        const id = safeId(b.message_id);
        check(
          await one("SELECT id FROM site_content_messages WHERE id=?", [id]),
          404,
          "Message not found",
        );
        data = {
          message_id: id,
          name: required(b.name, 80, "Name"),
          comment: required(b.comment, 1000, "Comment"),
          created_at: utc(),
        };
      } else if (resource === "testimonies") {
        table = TABLES.testimonies;
        data = {
          name: required(b.name, 80, "Name"),
          location: optional(b.location, 80),
          testimony: required(b.testimony, 1500, "Testimony"),
          show_name: b.show_name === true ? 1 : 0,
          is_approved: 0,
          created_at: utc(),
        };
        event = "onTestimony";
        subject = "New testimony awaiting approval";
      } else {
        table = TABLES.wall_prayers;
        data = {
          name: optional(b.name, 60),
          request: required(b.request, 400, "Request"),
          is_approved: 0,
          prayed_count: 0,
          created_at: utc(),
        };
        event = "onWall";
        subject = "New prayer wall post awaiting approval";
      }
      const id = await insert(table, data);
      if (event) await notify(event, subject);
      if (
        resource === "message_comments" &&
        String(req.get("Prefer")).includes("return=representation")
      )
        return res
          .status(201)
          .json([
            rowView(
              await one(
                `SELECT ${FIELDS.message_comments} FROM ${table} WHERE id=?`,
                [id],
              ),
            ),
          ]);
      res.status(201).json({ success: true, id });
    });
  const vote = route(async (req, res) => {
    await rate(req, "prayed", 120);
    const id = safeId(req.body?.p_id),
      voter = clean(req.body?.p_voter, 64);
    check(/^[a-zA-Z0-9_-]{16,64}$/.test(voter), 400, "Invalid voter ID");
    const secret = (await config()).formSecret,
      voterKey = hmac(secret, voter),
      ip = hmac(secret, req.ip || "unknown");
    const result = await transaction(async (connection) => {
      const prayer = await one(
        "SELECT prayed_count FROM site_content_wall_prayers WHERE id=? AND is_approved=1 FOR UPDATE",
        [id],
        connection,
      );
      if (!prayer) return null;
      const seen = await one(
        "SELECT prayer_id FROM site_content_wall_votes WHERE prayer_id=? AND voter=?",
        [id, voterKey],
        connection,
      );
      const recent = await one(
        "SELECT COUNT(*) n FROM site_content_wall_votes WHERE prayer_id=? AND ip=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)",
        [id, ip],
        connection,
      );
      if (seen || Number(recent.n) >= 5)
        return { counted: false, prayed_count: Number(prayer.prayed_count) };
      await query(
        "INSERT INTO site_content_wall_votes(prayer_id,voter,ip,created_at) VALUES (?,?,?,UTC_TIMESTAMP())",
        [id, voterKey, ip],
        connection,
      );
      await query(
        "UPDATE site_content_wall_prayers SET prayed_count=prayed_count+1 WHERE id=?",
        [id],
        connection,
      );
      return { counted: true, prayed_count: Number(prayer.prayed_count) + 1 };
    });
    res.json(result);
  });
  const analytics = async (days) => {
    const span = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const since =
      utc(new Date(Date.now() - (span - 1) * 864e5)).slice(0, 10) + " 00:00:00";
    const grouped = await query(
      "SELECT DATE_FORMAT(created_at,'%Y-%m-%d') day,SUM(kind='view') views,SUM(kind='sermon_play') plays FROM site_content_events WHERE created_at>=? GROUP BY day",
      [since],
    );
    const byDay = new Map(grouped.map((r) => [r.day, r]));
    const timeline = Array.from({ length: span }, (_, i) => {
      const day = utc(new Date(Date.now() - (span - i - 1) * 864e5)).slice(
        0,
        10,
      );
      return {
        day,
        views: Number(byDay.get(day)?.views || 0),
        plays: Number(byDay.get(day)?.plays || 0),
      };
    });
    const rank = async (field, kind) =>
      (
        await query(
          `SELECT ${field} n,COUNT(*) c FROM site_content_events WHERE kind=? AND ${field} IS NOT NULL AND created_at>=? GROUP BY ${field} ORDER BY c DESC LIMIT 8`,
          [kind, since],
        )
      ).map((r) => [r.n, Number(r.c)]);
    const devices = Object.fromEntries(await rank("device", "view"));
    const shares = Number(
      (
        await one(
          "SELECT COUNT(*) n FROM site_content_events WHERE kind='share' AND created_at>=?",
          [since],
        )
      ).n,
    );
    return {
      span,
      days: timeline,
      shares,
      topPages: await rank("path", "view"),
      topSermons: await rank("label", "sermon_play"),
      referrers: await rank("referrer", "view"),
      devices,
    };
  };
  const event = route(async (req, res) => {
    await rate(req, "events", 400);
    const b = object(req.body);
    check(/^[a-z_]{1,30}$/.test(b.kind || ""), 400, "Bad event");
    await insert("site_content_events", {
      kind: b.kind,
      label: optional(b.label, 200),
      path: optional(b.path, 200),
      referrer: optional(b.referrer, 200),
      device: ["mobile", "tablet", "desktop"].includes(b.device)
        ? b.device
        : null,
      created_at: utc(),
    });
    if (Math.random() < 0.01)
      await query(
        "DELETE FROM site_content_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 400 DAY)",
      );
    res.status(201).end();
  });
  const count = async (sql, params = []) => Number((await one(sql, params)).n);
  const dashboard = async (me) => {
    const d = { role: me.role, permissions: me.permissions };
    if (me.permissions.includes("messages")) {
      d.sermons = {
        total: await count("SELECT COUNT(*) n FROM site_content_messages"),
        featured: await count(
          "SELECT COUNT(*) n FROM site_content_messages WHERE is_featured=1",
        ),
        comments: await count(
          "SELECT COUNT(*) n FROM site_content_message_comments",
        ),
      };
      const files = await readdir(uploadsDir).catch(() => []);
      d.media = {
        uploads: files.filter((f) =>
          /\.(jpe?g|png|gif|webp|avif|mp[34]|webm|mov|m4[av]|og[av]|ogg|wav|aac|flac)$/i.test(
            f,
          ),
        ).length,
      };
    }
    if (me.permissions.includes("care")) {
      d.prayer = {
        total: await count("SELECT COUNT(*) n FROM prayer_requests"),
        unread: await count(
          "SELECT COUNT(*) n FROM prayer_requests WHERE is_read=0",
        ),
        private: await count(
          "SELECT COUNT(*) n FROM prayer_requests WHERE is_private=1",
        ),
        followup: await count(
          "SELECT COUNT(*) n FROM prayer_requests WHERE follow_up='in_progress'",
        ),
      };
      d.testimonies = {
        total: await count("SELECT COUNT(*) n FROM site_content_testimonies"),
        pending: await count(
          "SELECT COUNT(*) n FROM site_content_testimonies WHERE is_approved=0",
        ),
      };
      d.wall = {
        total: await count("SELECT COUNT(*) n FROM site_content_wall_prayers"),
        pending: await count(
          "SELECT COUNT(*) n FROM site_content_wall_prayers WHERE is_approved=0",
        ),
        prayed: await count(
          "SELECT COALESCE(SUM(prayed_count),0) n FROM site_content_wall_prayers WHERE is_approved=1",
        ),
      };
      d.enquiries = {
        total: await count("SELECT COUNT(*) n FROM connect_requests"),
        waiting: await count(
          "SELECT COUNT(*) n FROM connect_requests WHERE status='new'",
        ),
      };
      const activity = [];
      for (const [table, type, who] of [
        [
          "prayer_requests",
          "prayer",
          "IF(is_private=1,'Private request',name)",
        ],
        ["connect_requests", "enquiry", "name"],
        [TABLES.testimonies, "testimony", "name"],
        [TABLES.wall_prayers, "wall", "COALESCE(name,'Anonymous')"],
      ]) {
        for (const row of await query(
          `SELECT ${who} who,created_at FROM ${table} ORDER BY created_at DESC LIMIT 6`,
        ))
          activity.push({ type, who: row.who, at: row.created_at });
      }
      d.activity = activity
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 8);
    }
    if (me.permissions.includes("analytics")) {
      d.traffic = {
        views7: await count(
          "SELECT COUNT(*) n FROM site_content_events WHERE kind='view' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)",
        ),
        views30: await count(
          "SELECT COUNT(*) n FROM site_content_events WHERE kind='view' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)",
        ),
        plays30: await count(
          "SELECT COUNT(*) n FROM site_content_events WHERE kind='sermon_play' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)",
        ),
      };
    }
    if (me.permissions.includes("settings")) {
      const s = await settings();
      d.live = {
        isLive: s.live?.isLiveNow === true,
        title: clean(s.live?.title, 200),
      };
      d.events = {
        upcoming: [
          s.event,
          ...(Array.isArray(s.events) ? s.events : []),
        ].filter(
          (e) =>
            e?.title &&
            e.published !== false &&
            ((!e.end && !e.start) || new Date(e.end || e.start) >= new Date()),
        ).length,
      };
      const today = utc().slice(0, 10);
      d.announcements = {
        active: (Array.isArray(s.announcements) ? s.announcements : []).filter(
          (a) =>
            a?.published &&
            (!a.date || a.date <= today) &&
            (!a.expires || a.expires >= today),
        ).length,
      };
    }
    return d;
  };
  const messageData = (payload, partial = false) => {
    const out = {};
    for (const [key, max] of Object.entries({
      title: 200,
      description: 4000,
      link: 2000,
      media_url: 2000,
      notes_url: 2000,
      speaker: 120,
      category: 60,
      thumbnail_url: 2000,
    })) {
      if (!partial || Object.hasOwn(payload, key))
        out[key] =
          key === "title"
            ? required(payload[key], max, "Title")
            : optional(
                ["link", "media_url", "notes_url", "thumbnail_url"].includes(
                  key,
                )
                  ? safeLink(payload[key])
                  : payload[key],
                max,
              );
    }
    if (!partial || Object.hasOwn(payload, "media_type"))
      out.media_type = ["audio", "video"].includes(payload.media_type)
        ? payload.media_type
        : null;
    if (!partial || Object.hasOwn(payload, "is_featured"))
      out.is_featured = payload.is_featured === true ? 1 : 0;
    return out;
  };
  const manage = route(async (req, res) => {
    const action = req.body?.action,
      p = object(req.body?.payload);
    if (action === "list_hidden_assets")
      return res.json({
        filenames: (await query("SELECT filename FROM site_hidden_assets")).map(
          (r) => r.filename,
        ),
      });
    const perms = {
      create_message: "messages",
      update_message: "messages",
      delete_message: "messages",
      delete_comment: "messages",
      hide_asset: "media",
      unhide_asset: "media",
      get_analytics: "analytics",
      get_dashboard: null,
      get_notify_prefs: "settings",
      save_notify_prefs: "settings",
      list_prayer_requests: "care",
      mark_prayer_request_read: "care",
      set_prayer_followup: "care",
      delete_prayer_request: "care",
      list_connect_requests: "care",
      mark_connect_contacted: "care",
      delete_connect_request: "care",
      list_testimonies: "care",
      set_testimony_approved: "care",
      update_testimony: "care",
      delete_testimony: "care",
      list_wall_prayers: "care",
      set_wall_approved: "care",
      update_wall_prayer: "care",
      delete_wall_prayer: "care",
    };
    check(Object.hasOwn(perms, action), 400, "Unknown content action");
    await staff.authorize(req, res, () => {});
    if (res.headersSent) return;
    staff.allowed(req, perms[action]);
    if (action === "get_dashboard")
      return res.json({ dashboard: await dashboard(req.staff) });
    if (action === "get_analytics")
      return res.json({ analytics: await analytics(p.days) });
    if (action === "get_notify_prefs")
      return res.json({
        prefs: {
          email: "",
          onPrayer: false,
          onConnect: false,
          onTestimony: false,
          onWall: false,
          ...(await config()).notifications,
        },
      });
    if (action === "save_notify_prefs") {
      const email = clean(p.email, 190);
      check(!email || validEmail(email), 400, "Enter a valid email address");
      const prefs = {
        email,
        ...Object.fromEntries(
          ["onPrayer", "onConnect", "onTestimony", "onWall"].map((k) => [
            k,
            p[k] === true,
          ]),
        ),
      };
      check(
        !Object.values(prefs).includes(true) ||
          (email && process.env.PAI_SMTP_HOST && process.env.PAI_MAIL_FROM),
        422,
        "Configure the email sender and notification address before enabling alerts",
      );
      await updateConfig({ notifications: prefs });
      return res.json({ ok: true });
    }
    if (action === "hide_asset" || action === "unhide_asset") {
      const filename = clean(p.filename, 255);
      check(
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) &&
          !filename.includes(".."),
        400,
        "Invalid filename",
      );
      await query(
        action === "hide_asset"
          ? "INSERT IGNORE INTO site_hidden_assets(filename) VALUES (?)"
          : "DELETE FROM site_hidden_assets WHERE filename=?",
        [filename],
      );
      return res.json({ ok: true });
    }
    if (action === "create_message") {
      const id = await insert(TABLES.messages, {
        ...messageData(p),
        source: p.source === "live" ? "live" : "manual",
        created_at: utc(),
      });
      return res.json({
        message: rowView(
          await one(
            `SELECT ${FIELDS.messages} FROM site_content_messages WHERE id=?`,
            [id],
          ),
        ),
      });
    }
    if (action.startsWith("list_")) {
      const mapping = {
        list_prayer_requests: ["prayer_requests", "requests"],
        list_connect_requests: ["connect_requests", "requests"],
        list_testimonies: [TABLES.testimonies, "testimonies"],
        list_wall_prayers: [TABLES.wall_prayers, "prayers"],
      };
      const [table, key] = mapping[action];
      const rows = await query(
        `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 500`,
      );
      return res.json({
        [key]: rows.map((row) =>
          table === "prayer_requests"
            ? rowView({
                id: row.id,
                name: row.name,
                contact: [row.email, row.phone].filter(Boolean).join(" / "),
                request: row.request,
                is_private: row.is_private,
                is_read: row.is_read,
                follow_up: row.follow_up,
                admin_note: row.admin_note,
                created_at: row.created_at,
              })
            : table === "connect_requests"
              ? rowView({
                  id: row.id,
                  name: row.name,
                  email: row.email,
                  phone: row.phone,
                  kind: row.subject,
                  note: row.message,
                  is_contacted: row.status === "handled" ? 1 : 0,
                  created_at: row.created_at,
                })
              : rowView(row),
        ),
      });
    }
    const id = safeId(p.id);
    if (action === "update_message") {
      const data = messageData(p, true),
        keys = Object.keys(data);
      check(keys.length, 400, "Nothing to update");
      check(
        await one("SELECT id FROM site_content_messages WHERE id=?", [id]),
        404,
        "Message not found",
      );
      await query(
        `UPDATE site_content_messages SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
        [...Object.values(data), id],
      );
    } else if (action.startsWith("delete_")) {
      const table = {
        delete_message: TABLES.messages,
        delete_comment: TABLES.message_comments,
        delete_testimony: TABLES.testimonies,
        delete_wall_prayer: TABLES.wall_prayers,
        delete_prayer_request: "prayer_requests",
        delete_connect_request: "connect_requests",
      }[action];
      await transaction(async (connection) => {
        if (action === "delete_message")
          await query(
            "DELETE FROM site_content_message_comments WHERE message_id=?",
            [id],
            connection,
          );
        if (action === "delete_wall_prayer")
          await query(
            "DELETE FROM site_content_wall_votes WHERE prayer_id=?",
            [id],
            connection,
          );
        const result = await query(
          `DELETE FROM ${table} WHERE id=?`,
          [id],
          connection,
        );
        check(result.affectedRows, 404, "Record not found");
      });
    } else {
      const updates = {
        mark_prayer_request_read: [
          "prayer_requests",
          { is_read: p.is_read !== false ? 1 : 0 },
        ],
        set_prayer_followup: [
          "prayer_requests",
          {
            follow_up: ["new", "in_progress", "done"].includes(p.follow_up)
              ? p.follow_up
              : "new",
            admin_note: optional(p.admin_note, 1000),
            is_read: 1,
          },
        ],
        mark_connect_contacted: [
          "connect_requests",
          { status: p.is_contacted !== false ? "handled" : "new" },
        ],
        set_testimony_approved: [
          TABLES.testimonies,
          { is_approved: p.is_approved !== false ? 1 : 0 },
        ],
        set_wall_approved: [
          TABLES.wall_prayers,
          { is_approved: p.is_approved !== false ? 1 : 0 },
        ],
      };
      if (action === "update_testimony")
        updates[action] = [
          TABLES.testimonies,
          {
            name: required(p.name, 80, "Name"),
            location: optional(p.location, 80),
            testimony: required(p.testimony, 1500, "Testimony"),
            show_name: p.show_name === true ? 1 : 0,
          },
        ];
      if (action === "update_wall_prayer")
        updates[action] = [
          TABLES.wall_prayers,
          {
            name: optional(p.name, 60),
            request: required(p.request, 400, "Request"),
          },
        ];
      const [table, data] = updates[action];
      check(
        await one(`SELECT id FROM ${table} WHERE id=?`, [id]),
        404,
        "Record not found",
      );
      await query(
        `UPDATE ${table} SET ${Object.keys(data)
          .map((k) => `${k}=?`)
          .join(",")} WHERE id=?`,
        [...Object.values(data), id],
      );
    }
    res.json({ ok: true });
  });
  const searchData = async (value) => {
    const text = clean(value, 80);
    if (text.length < 2) return { query: text, results: [] };
    const like = "%" + text.replace(/[\\%_]/g, "\\$&") + "%";
    const rows = await query(
      "SELECT id,title,description,speaker,category FROM site_content_messages WHERE title LIKE ? OR description LIKE ? OR speaker LIKE ? OR category LIKE ? ORDER BY created_at DESC LIMIT 8",
      [like, like, like, like],
    );
    const results = rows.map((r) => ({
      type: "sermon",
      title: r.title,
      text: clean(r.description, 140),
      url: "/?m=" + encodeURIComponent(r.id) + "#sermons",
      meta: r.speaker || r.category || "",
    }));
    const s = await settings(),
      today = utc().slice(0, 10),
      matches = (str) =>
        String(str || "")
          .toLowerCase()
          .includes(text.toLowerCase());
    for (const e of [s.event, ...(Array.isArray(s.events) ? s.events : [])])
      if (
        e?.title &&
        e.published !== false &&
        [e.title, e.description, e.venue].some(matches)
      )
        results.push({
          type: "event",
          title: clean(e.title, 200),
          text: clean(e.description, 140),
          url: "/#events",
          meta: clean(e.dates, 100),
        });
    for (const a of Array.isArray(s.announcements) ? s.announcements : [])
      if (
        a?.published &&
        (!a.date || a.date <= today) &&
        (!a.expires || a.expires >= today) &&
        [a.title, a.body].some(matches)
      )
        results.push({
          type: "announcement",
          title: clean(a.title, 200),
          text: clean(a.body, 140),
          url: "/#announcements",
          meta: "",
        });
    for (const [title, body, url] of [
      ["About", s.about?.p1, "/#about"],
      ["Our mission", s.foundation?.missionText, "/#foundation"],
      ["Our vision", s.foundation?.visionText, "/#foundation"],
      ["Our story", s.foundation?.storyText, "/#foundation"],
      ["Giving", s.giving?.info, "/#give"],
      ["Contact", s.contact?.address, "/#contact"],
    ])
      if ([title, body].some(matches))
        results.push({
          type: "ministry",
          title,
          text: clean(body, 140),
          url,
          meta: "",
        });
    return { query: text, results: results.slice(0, 20) };
  };
  const register = (app) => {
    app.get("/api/form-token", formToken);
    app.get(
      "/api/rest/v1/site_settings",
      route(async (req, res) => res.json([{ data: await settings() }])),
    );
    app.get(
      "/api/rest/v1/:resource",
      route(async (req, res) =>
        res.json(await publicRows(req.params.resource, req.query)),
      ),
    );
    for (const resource of [
      "prayer_requests",
      "connect_requests",
      "message_comments",
      "testimonies",
      "wall_prayers",
    ])
      app.post("/api/rest/v1/" + resource, formGuard, publicPost(resource));
    app.post("/api/rest/v1/rpc/increment_prayed", vote);
    app.post("/api/rest/v1/site_events", event);
    app.post("/api/functions/v1/manage-content", sameOrigin, manage);
    app.get(
      "/api/search",
      route(async (req, res) => {
        await rate(req, "search", 120, 600);
        res.json(await searchData(req.query.q));
      }),
    );
  };
  return {
    settings,
    publicRows,
    searchData,
    dashboard,
    analytics,
    notify,
    register,
  };
}
