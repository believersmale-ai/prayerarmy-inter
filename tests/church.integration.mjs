import { runVolunteerIntegration } from "./volunteers.integration.mjs";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const database = `church_regression_${Date.now()}_${process.pid}`;
const config = {
  host: process.env.PAI_TEST_DB_HOST || "127.0.0.1",
  port: Number(process.env.PAI_TEST_DB_PORT || 3306),
  user: process.env.PAI_TEST_DB_USER || "root",
  password: process.env.PAI_TEST_DB_PASSWORD || "",
};
const db = await mysql.createConnection(config);
await db.query(`CREATE DATABASE \`${database}\``);
await db.query(`USE \`${database}\``);
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server,
  logs = "";
async function start() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_USER: config.user,
      DB_PASSWORD: config.password,
      DB_NAME: database,
      ADMIN_EMAIL: "church-owner@example.test",
      ADMIN_INITIAL_PASSWORD: "church-owner-password",
      ADMIN_FORCE_RESET: "",
      ADMIN_PASSKEY: "",
      PAI_DATA_DIR: "",
      PAI_PUBLIC_ACCOUNTS_ENABLED: "true",
      PAI_PUBLIC_REGISTRATION_ENABLED: "false",
      PAI_SMTP_HOST: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (b) => {
    logs += b;
  });
  server.stderr.on("data", (b) => {
    logs += b;
  });
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(base + "/api/health/db");
      if (r.ok) return;
    } catch {}
    if (server.exitCode !== null) throw Error("Server exited: " + logs);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Church test server did not initialize: " + logs);
}
const call = async (
  path,
  { method = "GET", body, cookie = "", expected, origin = base } = {},
) => {
  expected ??=
    method === "POST" &&
    /^\/api\/church\/(members|households|sessions)$/.test(path)
      ? 201
      : 200;
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  if (Array.isArray(expected))
    assert.ok(expected.includes(r.status), `${method} ${path}: ${text}`);
  else assert.equal(r.status, expected, `${method} ${path}: ${text}`);
  return {
    response: r,
    data: r.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text,
  };
};
let owner;
const church = (path, options = {}) =>
  call("/api/church" + path, { cookie: owner, ...options });
const memberData = {
  first_name: "Amina",
  last_name: "Mensah",
  email: "amina@example.test",
  phone: "+233200000001",
  birth_date: "1990-01-02",
  joined_date: "2026-01-01",
  membership_status: "member",
};
try {
  await start();
  await church("/members", { cookie: "", expected: 401 });
  await call("/church");
  await call("/church-management-ui.js");
  await call("/church-management.css");
  await call("/church-management.js", { expected: 404 });
  let r = await call("/api/admin/login", {
    method: "POST",
    body: {
      email: "church-owner@example.test",
      password: "church-owner-password",
    },
  });
  owner = r.response.headers.get("set-cookie").split(";")[0];
  const team = (action, payload) =>
    call("/api/functions/v1/admin-users", {
      method: "POST",
      cookie: owner,
      body: { action, payload },
    });
  const roles = {};
  for (const role of ["registrar", "usher", "editor", "media", "care"]) {
    await team("create_user", {
      role,
      email: role + "@example.test",
      name: role,
      password: "staff-test-password",
    });
    r = await call("/api/admin/login", {
      method: "POST",
      body: { email: role + "@example.test", password: "staff-test-password" },
    });
    roles[role] = r.response.headers.get("set-cookie").split(";")[0];
  }
  for (const role of ["registrar"])
    await church("/members", { cookie: roles[role] });
  for (const role of ["usher", "editor", "media", "care"]) {
    await church("/members", { cookie: roles[role], expected: 403 });
    await church("/members/export", { cookie: roles[role], expected: 403 });
    await church("/households", { cookie: roles[role], expected: 403 });
    await church("/groups", { cookie: roles[role], expected: 403 });
    await church("/activity", { cookie: roles[role], expected: 403 });
  }
  await church("/members", {
    method: "POST",
    origin: "https://untrusted.example",
    body: memberData,
    expected: 403,
  });
  await church("/members", {
    method: "POST",
    body: { ...memberData, email: "not-an-email" },
    expected: 400,
  });
  await church("/members", {
    method: "POST",
    body: { ...memberData, birth_date: "2026-02-30" },
    expected: 400,
  });
  const home = (
    await church("/households", {
      method: "POST",
      body: {
        name: "Mensah household",
        phone: "+233200000002",
        address: "Local test address",
      },
    })
  ).data.household;
  const otherHome = (
    await church("/households", {
      method: "POST",
      body: { name: "Other household" },
    })
  ).data.household;
  let m1 = (
    await church("/members", {
      method: "POST",
      body: {
        ...memberData,
        household_id: home.id,
        relationship: "Primary contact",
      },
    })
  ).data.member;
  let m2 = (
    await church("/members", {
      method: "POST",
      body: {
        first_name: "Kojo",
        last_name: "Mensah",
        membership_status: "visitor",
        household_id: home.id,
      },
    })
  ).data.member;
  const inactive = (
    await church("/members", {
      method: "POST",
      body: {
        first_name: "Inactive",
        last_name: "Person",
        membership_status: "inactive",
      },
    })
  ).data.member;
  assert.equal(m1.birth_date, "1990-01-02");
  assert.equal(m1.joined_date, "2026-01-01");
  assert.equal(m1.household_name, home.name);
  r = await church("/members?limit=1");
  assert.equal(r.data.members.length, 1);
  assert.equal(r.data.total, 3);
  r = await church("/members?search=" + encodeURIComponent("' OR 1=1 --"));
  assert.equal(r.data.total, 0);
  r = await church("/members?search=%25");
  assert.equal(r.data.total, 0);
  r = await church("/members?status=visitor");
  assert.equal(r.data.total, 1);
  let h = (
    await church("/households/" + home.id, {
      method: "PUT",
      body: { ...home, primary_contact_id: m1.id },
    })
  ).data.household;
  await church("/households/" + home.id, {
    method: "PUT",
    body: { ...h, primary_contact_id: inactive.id },
    expected: 400,
  });
  const priorVersion = m1.version;
  m1 = (
    await church("/members/" + m1.id, {
      method: "PUT",
      body: {
        ...m1,
        phone: "+233200000003",
        household_id: otherHome.id,
        relationship: "Relative",
      },
    })
  ).data.member;
  await church("/members/" + m1.id, {
    method: "PUT",
    body: { ...m1, version: priorVersion },
    expected: 409,
  });
  await church("/members/" + m1.id, {
    method: "PUT",
    body: { ...m1, version: undefined },
    expected: 428,
  });
  r = await church("/households/" + home.id);
  assert.equal(r.data.household.primary_contact_id, null);
  assert.ok(r.data.household.version > h.version);
  await church("/households/" + home.id + "/archive", {
    method: "POST",
    body: { version: r.data.household.version, archived: true },
    expected: 409,
  });
  const service = {
    title: "Sunday worship",
    location: "Main hall",
    starts_at: "2026-11-17T10:00:00+01:00",
    ends_at: "2026-11-17T12:00:00+01:00",
  };
  await church("/sessions", {
    method: "POST",
    body: service,
    cookie: roles.usher,
    expected: 403,
  });
  await church("/sessions", {
    method: "POST",
    body: { ...service, ends_at: "2026-11-16T10:00:00Z" },
    expected: 400,
  });
  await church("/sessions", {
    method: "POST",
    body: { ...service, starts_at: "2026-11-17T10:00" },
    expected: 400,
  });
  let session = (
    await church("/sessions", {
      method: "POST",
      cookie: roles.registrar,
      body: service,
      expected: 201,
    })
  ).data.session;
  assert.equal(session.starts_at, "2026-11-17T09:00:00.000Z");
  await church("/sessions/" + session.id + "/attendance", {
    method: "POST",
    body: {
      entries: [{ member_id: m1.id, status: "present", record_version: 0 }],
    },
    expected: 409,
  });
  session = (
    await church("/sessions/" + session.id + "/state", {
      method: "POST",
      body: { state: "open", version: session.version },
    })
  ).data.session;
  let roster = (
    await church("/sessions/" + session.id + "/roster", { cookie: roles.usher })
  ).data;
  assert.equal(roster.total, 2);
  assert.ok(!roster.roster.some((r) => r.id === inactive.id));
  for (const person of roster.roster)
    for (const key of ["email", "phone", "birth_date", "account_id"])
      assert.equal(
        Object.hasOwn(person, key),
        false,
        "Ushers do not receive contact or account details",
      );
  const mark = (entries, expected = 200, cookie = owner) =>
    church("/sessions/" + session.id + "/attendance", {
      method: "POST",
      cookie,
      body: { entries },
      expected,
    });
  const duplicate = await Promise.all([
    mark([{ member_id: m1.id, status: "present", record_version: 0 }]),
    mark([{ member_id: m1.id, status: "present", record_version: 0 }]),
  ]);
  assert.equal(
    duplicate.reduce((n, r) => n + r.data.changed, 0),
    1,
  );
  await mark([{ member_id: m1.id, status: "late", record_version: 1 }]);
  await mark([{ member_id: m1.id, status: "absent", record_version: 1 }], 409);
  await mark(
    [
      { member_id: m2.id, status: "present", record_version: 0 },
      { member_id: m1.id, status: "absent", record_version: 1 },
    ],
    409,
  );
  roster = (await church("/sessions/" + session.id + "/roster")).data;
  assert.equal(
    roster.roster.find((r) => r.id === m2.id).record_version,
    0,
    "Conflicting batches are rolled back",
  );
  await mark([{ member_id: m2.id, status: "present", record_version: 0 }]);
  await mark([{ member_id: m2.id, status: "unmarked", record_version: 1 }]);
  r = await church("/sessions/" + session.id);
  assert.equal(Number(r.data.stats.unmarked), 1);
  await mark([{ member_id: m2.id, status: "present", record_version: 2 }]);
  await mark(
    [
      { member_id: m1.id, status: "present", record_version: 2 },
      { member_id: m1.id.toUpperCase(), status: "late", record_version: 2 },
    ],
    400,
  );
  await mark(
    [{ member_id: m1.id, status: "present", record_version: 2 }],
    200,
    roles.usher,
  );
  const newcomer = (
    await church("/members", {
      method: "POST",
      body: {
        first_name: "New",
        last_name: "Arrival",
        membership_status: "visitor",
      },
      expected: 201,
    })
  ).data.member;
  await mark(
    [{ member_id: newcomer.id, status: "present", record_version: 0 }],
    409,
  );
  await church("/sessions/" + session.id + "/roster/refresh", {
    method: "POST",
    body: {},
    cookie: roles.usher,
    expected: 403,
  });
  r = await church("/sessions/" + session.id + "/roster/refresh", {
    method: "POST",
    body: {},
    cookie: roles.registrar,
  });
  assert.equal(r.data.added, 1);
  session = (
    await church("/sessions/" + session.id, {
      method: "PUT",
      body: { ...session, guest_count: 4 },
    })
  ).data.session;
  const from = "2026-11-01T00:00:00Z",
    to = "2026-12-01T00:00:00Z",
    range = "?" + new URLSearchParams({ from, to });
  r = await church("/reports/attendance" + range);
  assert.equal(r.data.summary.totalAttendance, 6);
  assert.equal(r.data.summary.unmarked, 1);
  assert.equal(r.data.summary.sessions, 1);
  await church("/reports/attendance" + range, {
    cookie: roles.usher,
    expected: 403,
  });
  await church(
    "/reports/attendance?from=2020-01-01T00:00:00Z&to=2026-12-01T00:00:00Z",
    { expected: 400 },
  );
  session = (
    await church("/sessions/" + session.id + "/state", {
      method: "POST",
      body: { state: "closed", version: session.version },
    })
  ).data.session;
  await mark([{ member_id: m1.id, status: "absent", record_version: 3 }], 409);
  await church("/sessions/" + session.id, {
    method: "PUT",
    body: { ...session, guest_count: 7 },
    expected: 409,
  });
  m2 = (
    await church("/members/" + m2.id + "/archive", {
      method: "POST",
      body: { version: m2.version, archived: true },
    })
  ).data.member;
  r = await church("/members/" + m2.id + "/history");
  assert.equal(r.data.history[0].status, "present");
  r = await church("/reports/attendance" + range);
  assert.equal(
    r.data.summary.totalAttendance,
    6,
    "Archiving preserves historical attendance",
  );
  let oldHome = (await church("/households/" + home.id)).data.household;
  oldHome = (
    await church("/households/" + home.id + "/archive", {
      method: "POST",
      body: { version: oldHome.version, archived: true },
    })
  ).data.household;
  await church("/members/" + m2.id + "/archive", {
    method: "POST",
    body: { version: m2.version, archived: false },
    expected: 400,
  });
  await church("/households/" + home.id + "/archive", {
    method: "POST",
    body: { version: oldHome.version, archived: false },
  });
  m2 = (
    await church("/members/" + m2.id + "/archive", {
      method: "POST",
      body: { version: m2.version, archived: false },
    })
  ).data.member;
  session = (
    await church("/sessions/" + session.id + "/state", {
      method: "POST",
      body: { state: "cancelled", version: session.version },
    })
  ).data.session;
  r = await church("/reports/attendance" + range);
  assert.equal(r.data.summary.totalAttendance, 0);
  session = (
    await church("/sessions/" + session.id + "/state", {
      method: "POST",
      body: { state: "open", version: session.version },
    })
  ).data.session;
  await church("/sessions/" + session.id + "/state", {
    method: "POST",
    body: { state: "scheduled", version: session.version },
    expected: 409,
  });
  const rows = [
    { first_name: "CSV", last_name: "One", email: "csv-one@example.test" },
    { first_name: "CSV", last_name: "Two" },
  ];
  r = await church("/members/import/preview", {
    method: "POST",
    body: { rows },
  });
  assert.equal(r.data.ready, true);
  const normalized = r.data.rows.map((r) => r.data),
    requestId = randomUUID();
  const imports = await Promise.all(
    [
      church("/members/import", {
        method: "POST",
        body: { rows: normalized, requestId },
        expected: [200, 201],
      }),
      church("/members/import", {
        method: "POST",
        body: { rows: normalized, requestId },
        expected: [200, 201],
      }),
    ].map((p) => p),
  );
  assert.equal(
    imports.reduce((n, r) => n + (!r.data.replayed ? 1 : 0), 0),
    1,
  );
  await church("/members/import", {
    method: "POST",
    body: { rows: [{ first_name: "Changed" }], requestId },
    expected: 409,
  });
  r = await church("/members/import/preview", {
    method: "POST",
    body: { rows },
  });
  assert.equal(r.data.ready, false);
  await church("/members/import", {
    method: "POST",
    body: { rows, requestId: randomUUID() },
    expected: 409,
  });
  await church("/members", {
    method: "POST",
    body: {
      first_name: '=HYPERLINK("https://example.test")',
      last_name: "CSV safety",
    },
    expected: 201,
  });
  r = await church("/members/export");
  assert.match(r.data, /"'=HYPERLINK/);
  assert.match(r.response.headers.get("cache-control"), /no-store/);
  r = await church("/reports/attendance/export" + range);
  assert.match(r.data, /Sunday worship/);
  const [account] = await db.execute(
    "INSERT INTO public_accounts(email,password_hash,display_name,status) VALUES (?,?,?,'active')",
    [memberData.email, "unused-test-hash", "Amina Mensah"],
  );
  await db.execute(
    "INSERT INTO public_account_roles(account_id,role) VALUES (?,'member')",
    [account.insertId],
  );
  r = await church("/accounts?email=" + memberData.email);
  assert.equal(r.data.accounts[0].id, String(account.insertId));
  m1 = (
    await church("/members/" + m1.id + "/account", {
      method: "PUT",
      body: { version: m1.version, account_id: String(account.insertId) },
    })
  ).data.member;
  await church("/members/" + m1.id, {
    method: "PUT",
    body: { ...m1, email: "changed@example.test" },
    expected: 409,
  });
  const otherMember = (
    await church("/members", {
      method: "POST",
      body: { first_name: "Another", email: memberData.email },
      expected: 201,
    })
  ).data.member;
  await church("/members/" + otherMember.id + "/account", {
    method: "PUT",
    body: {
      version: otherMember.version,
      account_id: String(account.insertId),
    },
    expected: 409,
  });
  m1 = (
    await church("/members/" + m1.id + "/account", {
      method: "PUT",
      body: { version: m1.version, account_id: null },
    })
  ).data.member;
  assert.equal(m1.account_id, null);
  r = await church("/activity");
  assert.ok(r.data.activity.some((a) => a.action === "member.link_account"));
  assert.ok(r.data.activity.every((a) => Array.isArray(a.changed_fields)));
  r = await church("/overview", { cookie: roles.usher });
  assert.equal(r.data.members, undefined);
  assert.equal(r.data.households, undefined);
  // Group edits and roster changes share a version to prevent lost updates.
  await church("/groups", { cookie: "", expected: 401 });
  await church("/groups", {
    method: "POST",
    body: { name: "Invalid", kind: "other" },
    expected: 400,
  });
  await church("/groups", {
    method: "POST",
    origin: "https://untrusted.example",
    body: { name: "Blocked", kind: "ministry" },
    expected: 403,
  });
  let group = (
    await church("/groups", {
      method: "POST",
      cookie: roles.registrar,
      body: {
        name: "Welcome ministry",
        kind: "ministry",
        meeting_details: "Sundays at 08:00",
      },
      expected: 201,
    })
  ).data.group;
  const groupPath = "/groups/" + group.id;
  await church(groupPath + "/archive", {
    method: "POST",
    body: null,
    expected: 400,
  });
  await church("/groups/not-an-id", { expected: 400 });
  await church("/groups/" + randomUUID(), { expected: 404 });
  await church(groupPath, {
    method: "PUT",
    body: { name: "Missing version", kind: "ministry" },
    expected: 428,
  });
  await church(groupPath + "/members/" + m1.id, {
    method: "PUT",
    cookie: roles.usher,
    body: { version: 1, role: "leader" },
    expected: 403,
  });
  await church(groupPath + "/members/" + m1.id, {
    method: "PUT",
    body: { version: 1, role: "admin" },
    expected: 400,
  });
  group = (
    await church(groupPath + "/members/" + m1.id, {
      method: "PUT",
      body: { version: group.version, role: "leader" },
    })
  ).data.group;
  await church(groupPath, {
    method: "PUT",
    body: { version: 1, name: "Stale name", kind: "small_group" },
    expected: 409,
  });
  assert.equal((await church(groupPath)).data.members[0].role, "leader");
  const sharedVersion = group.version;
  const attempts = await Promise.all(
    ["member", "leader"].map((role) =>
      church(groupPath + "/members/" + m2.id, {
        method: "PUT",
        body: { version: sharedVersion, role },
        expected: [200, 409],
      }),
    ),
  );
  assert.deepEqual(attempts.map((a) => a.response.status).sort(), [200, 409]);
  group = (await church(groupPath)).data.group;
  group = (
    await church(groupPath + "/members/" + m1.id, {
      method: "PUT",
      body: { version: group.version, role: "leader" },
    })
  ).data.group;
  assert.equal((await church(groupPath)).data.total, 2);
  group = (
    await church(groupPath + "/members/" + m1.id, {
      method: "PUT",
      body: { version: group.version, role: "removed" },
    })
  ).data.group;
  assert.equal((await church(groupPath)).data.total, 1);
  const [retained] = await db.query(
    "SELECT left_at FROM church_group_members WHERE group_id=? AND member_id=?",
    [group.id, m1.id],
  );
  assert.ok(retained[0].left_at);
  group = (
    await church(groupPath + "/members/" + m1.id, {
      method: "PUT",
      body: { version: group.version, role: "leader" },
    })
  ).data.group;
  assert.equal((await church(groupPath)).data.total, 2);
  // Archived member records remain on the roster, with no new assignments allowed.
  const gm = (await church("/members/" + m1.id)).data.member;
  await church("/members/" + m1.id + "/archive", {
    method: "POST",
    body: { version: gm.version, archived: true },
  });
  assert.ok(
    (await church(groupPath)).data.members.find((m) => m.id === m1.id)
      .archived_at,
  );
  assert.equal(
    (await church("/groups?search=Welcome")).data.groups[0].member_count,
    1,
  );
  await church(groupPath + "/members/" + m1.id, {
    method: "PUT",
    body: { version: group.version, role: "member" },
    expected: 409,
  });
  const archivedM = (await church("/members/" + m1.id)).data.member;
  await church("/members/" + m1.id + "/archive", {
    method: "POST",
    body: { version: archivedM.version, archived: false },
  });
  group = (
    await church(groupPath + "/archive", {
      method: "POST",
      body: { version: group.version, archived: true },
    })
  ).data.group;
  await church(groupPath + "/members/" + m1.id, {
    method: "PUT",
    body: { version: group.version, role: "removed" },
    expected: 409,
  });
  await church(groupPath, {
    method: "PUT",
    body: { version: group.version, name: "Locked", kind: "ministry" },
    expected: 409,
  });
  assert.equal((await church("/groups?search=Welcome")).data.total, 0);
  assert.equal(
    (await church("/groups?archived=true&kind=ministry")).data.total,
    1,
  );
  group = (
    await church(groupPath + "/archive", {
      method: "POST",
      body: { version: group.version, archived: false },
    })
  ).data.group;
  group = (
    await church(groupPath, {
      method: "PUT",
      body: {
        version: group.version,
        name: "Welcome team",
        kind: "small_group",
        location: "Main hall",
      },
    })
  ).data.group;
  assert.equal(
    (await church("/groups?kind=small_group&search=Welcome")).data.total,
    1,
  );
  assert.equal(
    (await church(groupPath + "?limit=1&page=2")).data.members.length,
    1,
  );
  const ga = (await church("/activity")).data.activity.find(
    (a) => a.action === "group.updated",
  );
  assert.equal(ga.record_name, "Welcome team");
  const volunteerShiftId = await runVolunteerIntegration({ church, roles, db });
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
  await start();
  r = await church("/members/" + m1.id);
  assert.equal(r.data.member.first_name, "Amina");
  r = await church("/sessions/" + session.id);
  assert.equal(r.data.session.guest_count, 4);
  assert.equal((await church(groupPath)).data.total, 2);
  assert.equal((await church(groupPath)).data.group.name, "Welcome team");
  assert.equal(
    (await church("/shifts/" + volunteerShiftId)).data.shift.title,
    "=Morning welcome",
  );
  assert.equal(
    (await church("/shifts/" + volunteerShiftId)).data.assignments.length,
    1,
  );
  const oversized = Array.from({ length: 5001 }, () => [
    randomUUID(),
    "Report bound fixture",
    "2026-11-17 09:00:00",
    "2026-11-17 11:00:00",
    "closed",
  ]);
  await db.execute(
    `INSERT INTO church_sessions(id,title,starts_at,ends_at,state,created_at,updated_at) VALUES ${oversized.map(() => "(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())").join(",")}`,
    oversized.flat(),
  );
  await church("/reports/attendance" + range, { expected: 422 });
  console.log(
    "PASS church integration: volunteer scheduling/conflicts/capacity, groups/leader rosters/concurrency/archives, roles/privacy, members/households, account links, atomic imports, concurrent attendance, history, reports, exports and restart persistence",
  );
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  if (server && server.exitCode === null)
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill();
    });
  await db.query(`DROP DATABASE \`${database}\``);
  await db.end();
}
