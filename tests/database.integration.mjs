import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { smtpFixture } from "./smtp-fixture.mjs";
// Explicit integration check: creates and removes its own isolated database.
// PAI_TEST_DB_HOST/PORT/USER/PASSWORD configure a disposable local test server.
const root = fileURLToPath(new URL("../", import.meta.url));
const database = `pai_regression_${Date.now()}_${process.pid}`;
const config = {
  host: process.env.PAI_TEST_DB_HOST || "127.0.0.1",
  port: Number(process.env.PAI_TEST_DB_PORT || 3306),
  user: process.env.PAI_TEST_DB_USER || "root",
  password: process.env.PAI_TEST_DB_PASSWORD || "",
  multipleStatements: true,
};
const db = await mysql.createConnection(config);
await db.query(`CREATE DATABASE \`${database}\`; USE \`${database}\`;`);
let server;
let persistentMedia;
const smtp = await smtpFixture();
try {
  for (const file of [
    "001_public_identity.sql",
    "002_membership_configuration.sql",
  ])
    await db.query(await readFile(root + "migrations/" + file, "utf8"));
  const idColumn =
    process.env.PAI_TEST_UUID_SCHEMA === "true"
      ? "VARCHAR(36) PRIMARY KEY"
      : process.env.PAI_TEST_BIGINT_SCHEMA === "true"
        ? "BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT"
        : "INT PRIMARY KEY AUTO_INCREMENT";
  if (process.env.PAI_TEST_FRESH_SCHEMA !== "true") {
    await db.query(`CREATE TABLE IF NOT EXISTS site_content_messages (id ${idColumn},title VARCHAR(200),description TEXT,link TEXT,media_url TEXT,media_type VARCHAR(10),notes_url TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_content_testimonies (id ${idColumn},name VARCHAR(80),location VARCHAR(80),testimony TEXT,is_approved TINYINT DEFAULT 0,show_name TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_content_wall_prayers (id ${idColumn},name VARCHAR(80),request TEXT,prayed_count INT DEFAULT 0,is_approved TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO site_content_testimonies(id,name,testimony,is_approved,show_name) VALUES ('1','Private name','Approved anonymous testimony',1,0),('2','Unapproved name','Not approved',0,1);`);
  }
  if (process.env.PAI_TEST_BIGINT_SCHEMA === "true") {
    for (const table of [
      "site_content_messages",
      "site_content_testimonies",
      "site_content_wall_prayers",
    ])
      await db.query(`ALTER TABLE ${table} AUTO_INCREMENT=9007199254740993`);
  }
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start(overrides = {}) {
    server = spawn(process.execPath, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "test",
        ADMIN_FORCE_RESET: "",
        ADMIN_PASSKEY: "",
        DB_HOST: config.host,
        DB_PORT: String(config.port),
        DB_USER: config.user,
        DB_PASSWORD: config.password,
        DB_NAME: database,
        PAI_DATA_DIR: "",
        ADMIN_EMAIL: "owner@example.test",
        ADMIN_INITIAL_PASSWORD: "local-test-password",
        PAI_PUBLIC_ACCOUNTS_ENABLED: "true",
        PAI_PUBLIC_REGISTRATION_ENABLED: "true",
        PAI_SMTP_HOST: "127.0.0.1",
        PAI_SMTP_PORT: String(smtp.port),
        PAI_SMTP_USER: "local-test",
        PAI_SMTP_PASS: "local-test",
        PAI_MAIL_FROM: "website@example.test",
        PAI_PUBLIC_BASE_URL: base.replace("http:", "https:"),
        ...overrides,
      },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("startup failed");
  }
  const get = (p, init = {}) => fetch(base + p, init);
  const send = (p, b, opts = {}) =>
    get(p, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...opts.headers,
      },
      body: JSON.stringify(b),
      ...Object.fromEntries(
        Object.entries(opts).filter(([k]) => k !== "headers"),
      ),
    });
  await start();
  if (process.env.PAI_TEST_FRESH_SCHEMA === "true")
    await db.query(
      "INSERT INTO site_content_testimonies(id,name,testimony,is_approved,show_name,created_at) VALUES ('1','Private name','Approved anonymous testimony',1,0,UTC_TIMESTAMP()),('2','Unapproved name','Not approved',0,1,UTC_TIMESTAMP())",
    );
  let r = await send("/api/admin/login", {
    email: "owner@example.test",
    password: "local-test-password",
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  r = await get("/api/admin/session", { headers: { Cookie: cookie } });
  assert.equal((await r.json()).user.email, "owner@example.test");
  r = await get("/api/settings");
  assert.equal(r.status, 200);
  const settings = await r.json();
  const revision = Number(r.headers.get("X-Settings-Revision"));
  settings.general.churchName = "Local regression";
  settings.passkey = "must-not-save";
  settings.notifications = { email: "private@example.test" };
  r = await send("/api/settings", settings, {
    headers: { Cookie: cookie, "If-Match-Settings-Revision": String(revision) },
  });
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.revision, revision + 1);
  assert.equal(saved.settings.general.churchName, "Local regression");
  assert.equal(saved.settings.passkey, undefined);
  assert.equal(saved.settings.notifications, undefined);
  r = await send("/api/settings", settings, {
    headers: { Cookie: cookie, "If-Match-Settings-Revision": String(revision) },
  });
  assert.equal(r.status, 409);
  r = await get("/api/form-token");
  const token = (await r.json()).token;
  await new Promise((r) => setTimeout(r, 2100));
  r = await send("/api/rest/v1/prayer_requests", {
    name: "Tester",
    contact: "phone123",
    request: "Local private prayer",
    is_private: true,
    _ft: token,
  });
  assert.equal(r.status, 201);
  r = await send("/api/rest/v1/connect_requests", {
    name: "Tester",
    email: "test@example.test",
    kind: "visitor",
    note: "Local enquiry",
    _ft: token,
  });
  assert.equal(r.status, 201);
  const manage = (action, payload = {}) =>
    send(
      "/api/functions/v1/manage-content",
      { action, payload },
      { headers: { Cookie: cookie } },
    );
  r = await manage("list_prayer_requests");
  assert.equal(r.status, 200);
  let row = (await r.json()).requests[0];
  assert.equal(row.contact, "phone123");
  assert.equal(row.is_private, true);
  assert.equal(row.is_read, false);
  r = await manage("set_prayer_followup", {
    id: row.id,
    follow_up: "in_progress",
    admin_note: "Local note",
  });
  assert.equal(r.status, 200);
  r = await manage("list_prayer_requests");
  row = (await r.json()).requests[0];
  assert.equal(row.is_read, true);
  assert.equal(row.admin_note, "Local note");
  assert.equal(row.follow_up, "in_progress");
  r = await manage("list_connect_requests");
  row = (await r.json()).requests[0];
  assert.equal(row.note, "Local enquiry");
  assert.equal(row.kind, "visitor");
  await manage("mark_connect_contacted", { id: row.id, is_contacted: true });
  r = await manage("list_connect_requests");
  assert.equal((await r.json()).requests[0].is_contacted, true);
  r = await get("/api/rest/v1/testimonies");
  const rows = await r.json();
  assert.ok(rows.length);
  assert.ok(rows.every((r) => r.name === "Anonymous"));
  assert.ok(rows.every((r) => r.testimony !== "Not approved"));
  r = await send(
    "/api/admin/membership/configuration",
    { approvalMode: "automatic", requireEmailVerification: false },
    { method: "PUT", headers: { Cookie: cookie } },
  );
  assert.equal(r.status, 400);
  r = await send(
    "/api/admin/membership/configuration",
    { approvalMode: "manual", requireEmailVerification: false },
    { method: "PUT", headers: { Cookie: cookie } },
  );
  assert.equal(r.status, 200);
  r = await send("/api/public/register", {
    email: "member" + Date.now() + "@example.test",
    displayName: "Local member",
    password: "local-member-password",
  });
  assert.equal(r.status, 202);
  r = await get("/api/admin/membership/applications", {
    headers: { Cookie: cookie },
  });
  const member = (await r.json()).applications[0];
  assert.ok(member);
  r = await send(
    "/api/admin/membership/applications/" + member.id + "/decision",
    { decision: "approve" },
    { headers: { Cookie: cookie } },
  );
  assert.equal(r.status, 200);
  r = await send("/api/public/login", {
    email: member.email,
    password: "local-member-password",
  });
  assert.equal(r.status, 200);
  const memberCookie = r.headers.get("set-cookie").split(";")[0];
  r = await get("/api/public/me", { headers: { Cookie: memberCookie } });
  assert.deepEqual((await r.json()).account.roles, ["member"]);

  // Every content workflow uses the browser's existing API contract.
  const write = async (resource, data, prefer) =>
    send(
      "/api/rest/v1/" + resource,
      { ...data, _ft: token },
      prefer ? { headers: { Prefer: prefer } } : {},
    );
  r = await manage("create_message", {
    title: "Integration sermon",
    description: "Public sermon only",
    speaker: "Local speaker",
    category: "Teaching",
    media_type: "audio",
    media_url: "/assets/uploads/sample.mp3",
    is_featured: true,
  });
  assert.equal(r.status, 200, await r.clone().text());
  const message = (await r.json()).message;
  assert.ok(message.id);
  if (process.env.PAI_TEST_BIGINT_SCHEMA === "true")
    assert.equal(message.id, "9007199254740993");
  assert.equal(message.is_featured, true);
  r = await manage("update_message", {
    id: message.id,
    title: "Updated integration sermon",
    notes_url: "javascript:alert(1)",
  });
  assert.equal(r.status, 200);
  r = await get("/api/rest/v1/messages?limit=1");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).length, 1);
  r = await write(
    "message_comments",
    { message_id: message.id, name: "Commenter", comment: "Public comment" },
    "return=representation",
  );
  assert.equal(r.status, 201);
  const comment = (await r.json())[0];
  assert.equal(comment.message_id, message.id);
  r = await get("/api/rest/v1/message_comments?message_id=eq." + message.id);
  assert.equal((await r.json()).length, 1);
  r = await write("testimonies", {
    name: "Unpublished person",
    testimony: "Moderated testimony",
    show_name: false,
  });
  assert.equal(r.status, 201);
  const testimonyId = (await r.json()).id;
  r = await get("/api/rest/v1/testimonies");
  assert.ok(!(await r.json()).some((row) => row.id === testimonyId));
  await manage("set_testimony_approved", {
    id: testimonyId,
    is_approved: true,
  });
  r = await get("/api/rest/v1/testimonies");
  assert.equal(
    (await r.json()).find((row) => row.id === testimonyId).name,
    "Anonymous",
  );
  await manage("update_testimony", {
    id: testimonyId,
    name: "Consenting person",
    testimony: "Updated testimony",
    show_name: true,
  });
  r = await get("/api/rest/v1/testimonies");
  assert.equal(
    (await r.json()).find((row) => row.id === testimonyId).name,
    "Consenting person",
  );
  r = await write("wall_prayers", {
    name: "Praying visitor",
    request: "Moderated prayer",
  });
  assert.equal(r.status, 201);
  const wallId = (await r.json()).id;
  r = await get("/api/rest/v1/wall_prayers");
  assert.ok(!(await r.json()).some((row) => row.id === wallId));
  await manage("set_wall_approved", { id: wallId, is_approved: true });
  const votes = await Promise.all(
    Array.from({ length: 8 }, () =>
      send("/api/rest/v1/rpc/increment_prayed", {
        p_id: wallId,
        p_voter: "integration-voter-123456",
      }),
    ),
  );
  const voteResults = await Promise.all(votes.map((r) => r.json()));
  assert.equal(voteResults.filter((r) => r.counted).length, 1);
  assert.ok(voteResults.every((r) => r.prayed_count === 1));
  for (let i = 0; i < 5; i++)
    await send("/api/rest/v1/rpc/increment_prayed", {
      p_id: wallId,
      p_voter: "different-voter-" + String(i).padStart(8, "0"),
    });
  r = await get("/api/rest/v1/wall_prayers");
  assert.equal(
    (await r.json()).find((r) => r.id === wallId).prayed_count,
    5,
    "Shared-address daily cap is enforced",
  );
  for (const kind of ["view", "sermon_play", "share"]) {
    r = await send("/api/rest/v1/site_events", {
      kind,
      path: "/",
      label: "Local sermon",
      device: "desktop",
    });
    assert.equal(r.status, 201);
  }
  r = await manage("get_analytics", { days: 7 });
  assert.equal(r.status, 200);
  const a = (await r.json()).analytics;
  assert.equal(a.days.length, 7);
  assert.equal(a.shares, 1);
  assert.ok(a.days.some((d) => d.views === 1));
  r = await manage("get_dashboard");
  assert.equal(r.status, 200);
  assert.ok((await r.json()).dashboard.sermons.total >= 1);
  r = await manage("save_notify_prefs", {
    email: "alerts@example.test",
    onPrayer: false,
  });
  assert.equal(r.status, 200);
  r = await manage("get_notify_prefs");
  assert.equal((await r.json()).prefs.email, "alerts@example.test");
  for (const path of [
    "/",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/sitemap.xml",
    "/podcast.xml",
    "/llms.txt",
    "/.well-known/mcp/server-card.json",
    "/index.md",
    "/privacy.md",
    "/api/rest/v1/site_settings",
  ]) {
    r = await get(path);
    assert.equal(r.status, 200, path);
  }
  r = await get("/", { headers: { Accept: "text/markdown" } });
  assert.match(r.headers.get("Content-Type"), /markdown/);
  assert.ok(r.headers.get("Link").includes("sitemap"));
  r = await get("/podcast.xml");
  assert.match(await r.text(), /Updated integration sermon/);
  r = await get("/api/search?q=integration");
  assert.ok((await r.json()).results.some((r) => r.type === "sermon"));
  r = await send("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal((await r.json()).result.protocolVersion, "2025-06-18");
  r = await send("/mcp", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_sermons", arguments: { limit: 5 } },
  });
  assert.ok(
    (await r.json()).result.structuredContent.sermons.some(
      (m) => m.id === message.id,
    ),
  );
  r = await send("/mcp", [null, 1]);
  assert.equal(r.status, 200);
  assert.ok((await r.json()).every((r) => r.error.code === -32600));
  r = await get("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad json",
  });
  assert.equal((await r.json()).error.code, -32700);
  const team = (action, payload = {}, asCookie = cookie) =>
    send(
      "/api/functions/v1/admin-users",
      { action, payload },
      { headers: { Cookie: asCookie } },
    );
  const roleCookies = {};
  for (const role of ["editor", "media", "care"]) {
    r = await team("create_user", {
      email: role + "@example.test",
      name: role,
      password: "role-test-password",
      role,
    });
    assert.equal(r.status, 200, await r.clone().text());
    r = await send("/api/admin/login", {
      email: role + "@example.test",
      password: "role-test-password",
    });
    assert.equal(r.status, 200);
    const c = r.headers.get("set-cookie").split(";")[0];
    roleCookies[role] = c;
    r = await get("/api/admin/session", { headers: { Cookie: c } });
    assert.equal((await r.json()).user.role, role);
    r = await send(
      "/api/functions/v1/manage-content",
      { action: "list_prayer_requests" },
      { headers: { Cookie: c } },
    );
    assert.equal(r.status, role === "care" ? 200 : 403);
    r = await send(
      "/api/functions/v1/manage-content",
      { action: "create_message", payload: { title: "Forbidden test" } },
      { headers: { Cookie: c } },
    );
    assert.equal(r.status, role === "care" ? 403 : 200);
    r = await team("list_users", {}, c);
    assert.equal(r.status, 403);
    r = await get("/api/media", { headers: { Cookie: c } });
    assert.equal(r.status, role === "care" ? 403 : 200);
    r = await get("/api/admin/membership/configuration", {
      headers: { Cookie: c },
    });
    assert.equal(r.status, 403);
    r = await send(
      "/api/functions/v1/manage-content",
      { action: "get_dashboard" },
      { headers: { Cookie: c } },
    );
    const dashboard = (await r.json()).dashboard;
    assert.equal(Boolean(dashboard.prayer), role === "care");
    assert.equal(
      dashboard.activity?.some((a) => a.who === "Tester"),
      role === "care" ? true : undefined,
    );
  }
  r = await team("list_users");
  const users = (await r.json()).users;
  const owner = users.find((u) => u.email === "owner@example.test"),
    media = users.find((u) => u.email === "media@example.test");
  r = await team("set_role", { user_id: owner.user_id, role: "editor" });
  assert.equal(r.status, 400, "Cannot remove final owner");
  r = await team("set_active", { user_id: media.user_id, active: false });
  assert.equal(r.status, 200);
  r = await get("/api/media", { headers: { Cookie: roleCookies.media } });
  assert.equal(r.status, 401, "Disabled staff session is revoked");
  r = await send(
    "/api/auth/v1/user",
    { password: "changed-role-password" },
    { method: "PUT", headers: { Cookie: roleCookies.editor } },
  );
  assert.equal(r.status, 200);
  r = await send("/api/admin/login", {
    email: "editor@example.test",
    password: "role-test-password",
  });
  assert.equal(r.status, 401);
  r = await send("/api/admin/login", {
    email: "editor@example.test",
    password: "changed-role-password",
  });
  assert.equal(r.status, 200);

  // Media uploads are checked by content and remain protected by role permissions.
  const upload = async (blob, filename, asCookie = cookie) => {
    const form = new FormData();
    form.append("files", blob, filename);
    return get("/api/upload", {
      method: "POST",
      headers: { Origin: base, Cookie: asCookie },
      body: form,
    });
  };
  const png = new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
  r = await upload(png, "integration-picture.png");
  assert.equal(r.status, 200, await r.clone().text());
  const uploaded = (await r.json()).files[0];
  r = await get("/" + uploaded.url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("content-security-policy"), "sandbox");
  r = await upload(
    new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/png" }),
    "spoofed-picture.png",
  );
  assert.equal(r.status, 415);
  r = await upload(png, "forbidden-picture.png", roleCookies.care);
  assert.equal(r.status, 403);
  r = await get("/api/media/" + encodeURIComponent(uploaded.filename), {
    method: "DELETE",
    headers: { Origin: base, Cookie: cookie },
  });
  assert.equal(r.status, 200);
  r = await manage("hide_asset", { filename: "prayer-army-logo.png" });
  assert.equal(r.status, 200);
  r = await send("/api/functions/v1/manage-content", {
    action: "list_hidden_assets",
  });
  assert.ok((await r.json()).filenames.includes("prayer-army-logo.png"));
  await manage("unhide_asset", { filename: "prayer-army-logo.png" });
  // Notification mail contains no private prayer text.
  r = await manage("save_notify_prefs", {
    email: "alerts@example.test",
    onPrayer: true,
  });
  assert.equal(r.status, 200);
  const mailCount = smtp.messages.length;
  r = await write("prayer_requests", {
    name: "Private visitor",
    request: "DO-NOT-EMAIL-THIS-PRIVATE-REQUEST",
    is_private: true,
  });
  assert.equal(r.status, 201);
  assert.equal(smtp.messages.length, mailCount + 1);
  assert.ok(!smtp.messages.at(-1).includes("DO-NOT-EMAIL"));
  // Automatic and manual approval both require the emailed, single-use verification token.
  r = await send(
    "/api/admin/membership/configuration",
    { approvalMode: "automatic", requireEmailVerification: true },
    { method: "PUT", headers: { Cookie: cookie } },
  );
  assert.equal(r.status, 200);
  const autoEmail = "verified-" + Date.now() + "@example.test";
  r = await send("/api/public/register", {
    email: autoEmail,
    displayName: "Verified member",
    password: "verified-password",
  });
  assert.equal(r.status, 202);
  const mail = smtp.messages
    .at(-1)
    .replace(/=\r?\n/g, "")
    .replace(/=3D/g, "=");
  const verifyToken = mail.match(/token=([a-f0-9]{64})/)[1];
  r = await get("/api/public/verify-email?token=" + verifyToken);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /now sign in/);
  r = await get("/api/public/verify-email?token=" + verifyToken);
  assert.equal(r.status, 400);
  r = await send("/api/public/login", {
    email: autoEmail,
    password: "verified-password",
  });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).account.roles, ["member"]);
  r = await send(
    "/api/functions/v1/change-passkey",
    { newPasskey: "local-shared-test-key" },
    { headers: { Cookie: cookie } },
  );
  assert.equal(r.status, 200);
  await team("set_legacy", { enabled: true });
  r = await send("/api/verify-passkey", { passkey: "local-shared-test-key" });
  assert.equal(r.status, 200);
  const sharedCookie = r.headers.get("set-cookie").split(";")[0];
  await team("set_legacy", { enabled: false });
  r = await get("/api/admin/session", { headers: { Cookie: sharedCookie } });
  assert.equal(r.status, 401);
  r = await manage("delete_comment", { id: comment.id });
  assert.equal(r.status, 200);
  r = await manage("delete_wall_prayer", { id: wallId });
  assert.equal(r.status, 200);
  r = await manage("delete_message", { id: message.id });
  assert.equal(r.status, 200);
  r = await get("/api/rest/v1/message_comments");
  assert.ok(!(await r.json()).some((c) => c.message_id === message.id));
  // Editors can publish content but cannot change the security-only tracking block.
  r = await get("/api/settings");
  let state = await r.json();
  let revisionNow = r.headers.get("X-Settings-Revision");
  state.tracking = { metaPixelId: "123456789012345" };
  r = await send("/api/settings", state, {
    headers: { Cookie: cookie, "If-Match-Settings-Revision": revisionNow },
  });
  assert.equal(r.status, 200);
  r = await get("/api/settings");
  state = await r.json();
  revisionNow = r.headers.get("X-Settings-Revision");
  state.tracking = { metaPixelId: "999999999999999" };
  r = await send("/api/settings", state, {
    headers: {
      Cookie: roleCookies.editor,
      "If-Match-Settings-Revision": revisionNow,
    },
  });
  assert.equal(r.status, 200);
  r = await get("/api/settings");
  assert.equal((await r.json()).tracking.metaPixelId, "123456789012345");
  // Competing owner changes serialize; exactly one active owner must remain.
  await team("create_user", {
    email: "backup@example.test",
    name: "Backup",
    password: "backup-password",
    role: "owner",
  });
  r = await send("/api/admin/login", {
    email: "backup@example.test",
    password: "backup-password",
  });
  assert.equal(r.status, 200);
  const backupCookie = r.headers.get("set-cookie").split(";")[0];
  r = await team("list_users");
  const backup = (await r.json()).users.find(
    (u) => u.email === "backup@example.test",
  );
  const decisions = await Promise.all([
    team("set_role", { user_id: owner.user_id, role: "editor" }),
    team("set_role", { user_id: backup.user_id, role: "editor" }, backupCookie),
  ]);
  assert.equal(decisions.filter((r) => r.status === 200).length, 1);
  assert.ok(decisions.every((r) => [200, 400, 403].includes(r.status)));
  const [activeOwners] = await db.query(
    "SELECT COUNT(*) n FROM admin_users u LEFT JOIN node_staff_profiles p ON p.user_id=CAST(u.id AS CHAR) WHERE u.is_active=1 AND COALESCE(p.role,IF(u.role='admin','owner',u.role))='owner'",
  );
  assert.equal(Number(activeOwners[0].n), 1);
  console.log(
    "PASS all Node content modules, moderation, concurrent votes, analytics, pages/MCP, staff roles and revocation",
  );
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
  await start();
  r = await get("/api/settings");
  assert.equal((await r.json()).general.churchName, "Local regression");
  r = await get("/api/admin/session", { headers: { Cookie: cookie } });
  assert.equal(r.status, 200, "Staff session survives process restart");
  r = await write("prayer_requests", {
    name: "After restart",
    request: "Original form token still valid",
    is_private: true,
  });
  assert.equal(r.status, 201);
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
  await start({ NODE_ENV: "production" });
  r = await send("/api/admin/login", {
    email: "owner@example.test",
    password: "local-test-password",
  });
  assert.equal(r.status, 403, "Production staff sign-in requires HTTPS");
  const secureHeaders = {
    Origin: base.replace("http:", "https:"),
    "X-Forwarded-Proto": "https",
    Cookie: cookie,
  };
  r = await get("/api/upload", { method: "POST", headers: secureHeaders });
  assert.equal(r.status, 503, "Production uploads require durable storage");
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
  persistentMedia = await mkdtemp(join(tmpdir(), "pai-media-test-"));
  await start({ NODE_ENV: "production", PAI_DATA_DIR: persistentMedia });
  const persistentForm = new FormData();
  persistentForm.append("files", png, "persistent-picture.png");
  r = await get("/api/upload", {
    method: "POST",
    headers: secureHeaders,
    body: persistentForm,
  });
  assert.equal(r.status, 200, await r.clone().text());
  const storedMedia = (await r.json()).files[0];
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
  await start({ NODE_ENV: "production", PAI_DATA_DIR: persistentMedia });
  r = await get("/" + storedMedia.url);
  assert.equal(
    r.status,
    200,
    "Uploaded media survives a production process restart",
  );
  await r.arrayBuffer();
  r = await get("/api/media/" + encodeURIComponent(storedMedia.filename), {
    method: "DELETE",
    headers: secureHeaders,
  });
  assert.equal(r.status, 200);
  console.log(
    "PASS Node integration: authentication, settings revision conflict, private forms, follow-up, anonymous testimonies, membership approval, persistence across restart",
  );
} finally {
  if (server && server.exitCode === null)
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill();
    });
  await db.query(`DROP DATABASE \`${database}\``);
  await db.end();
  await smtp.close();
  if (persistentMedia)
    await rm(persistentMedia, { recursive: true, force: true });
}
