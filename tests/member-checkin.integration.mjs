import assert from "node:assert/strict";
import { randomBytes, scryptSync, createHash } from "node:crypto";
export async function runMemberCheckinIntegration({ church, call, db, roles }) {
  const salt = randomBytes(16).toString("hex"),
    password = "member-test-password",
    hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const account = async (name, role = "member", status = "active") => {
    const email = name.toLowerCase() + "@checkin.example.test";
    const [r] = await db.execute(
      "INSERT INTO public_accounts(email,password_hash,display_name,status,email_verified_at) VALUES (?,?,?,?,UTC_TIMESTAMP())",
      [email, hash, name, status],
    );
    const id = String(r.insertId);
    await db.execute(
      "INSERT INTO public_account_roles(account_id,role) VALUES (?,?)",
      [id, role],
    );
    return { id, email };
  };
  const a = await account("SelfOne"),
    b = await account("SelfTwo"),
    unlinked = await account("Unlinked"),
    blogger = await account("Blogger", "blogger"),
    pending = await account("Pending", "member", "pending");
  const login = async (a, expected = 200) => {
    const r = await call("/api/public/login", {
      method: "POST",
      body: { email: a.email, password },
      expected,
    });
    return r.response.headers.get("set-cookie")?.split(";")[0];
  };
  const ac = await login(a),
    bc = await login(b),
    uc = await login(unlinked),
    blogc = await login(blogger);
  await login(pending, 401);
  const publicCall = (path, options = {}) =>
    call("/api/public/church" + path, { cookie: ac, ...options });
  await publicCall("/dashboard", { cookie: "", expected: 401 });
  await publicCall("/dashboard", { cookie: roles.registrar, expected: 401 });
  await publicCall("/dashboard", { cookie: blogc, expected: 403 });
  await call("/api/admin/session", { cookie: ac, expected: 401 });
  assert.equal((await publicCall("/dashboard")).data.linked, false);
  const member = async (acct, name) => {
    let m = (
      await church("/members", {
        method: "POST",
        body: { first_name: name, email: acct.email },
        expected: 201,
      })
    ).data.member;
    return (
      await church(`/members/${m.id}/account`, {
        method: "PUT",
        body: { version: m.version, account_id: acct.id },
      })
    ).data.member;
  };
  let m = await member(a, "Self One"),
    m2 = await member(b, "Self Two");
  const time = (offset) => new Date(Date.now() + offset * 60e3).toISOString();
  const payload = {
    title: "Member arrival service",
    location: "Main hall",
    starts_at: time(30),
    ends_at: time(90),
  };
  const session = (await church("/sessions", { method: "POST", body: payload }))
    .data.session;
  const sp = "/sessions/" + session.id;
  const config = async (body = {}, expected = 200) =>
    church(sp + "/check-in", {
      method: "PUT",
      body: {
        version: (await church(sp)).data.session.version,
        enabled: true,
        opens_at: time(-10),
        closes_at: time(60),
        ...body,
      },
      expected,
    });
  const checkin = async (code, options = {}) =>
    publicCall(sp + "/check-in", {
      method: "POST",
      body: { code },
      ...options,
    });
  await church("/sessions", {
    method: "POST",
    body: { ...payload, starts_at: "2030-02-30T08:00:00Z" },
    expected: 400,
  });
  assert.ok(
    !(await publicCall("/dashboard")).data.sessions.some(
      (s) => s.id === session.id,
    ),
  );
  for (const role of ["usher", "care", "editor", "media"]) {
    await church(sp + "/check-in", { cookie: roles[role], expected: 403 });
    await church(sp + "/check-in", {
      cookie: roles[role],
      method: "PUT",
      body: { enabled: false, version: 1 },
      expected: 403,
    });
  }
  await config({ opens_at: time(-2000) }, 400);
  await config({ closes_at: time(120) }, 400);
  await config({ opens_at: time(70), closes_at: time(60) }, 400);
  await config({ enabled: "true" }, 400);
  let issued = (await config({ opens_at: time(10) })).data;
  assert.match(issued.code, /^[0-9A-F]{8}$/);
  const firstCode = issued.code;
  assert.equal(
    (await publicCall("/dashboard")).data.sessions.find(
      (s) => s.id === session.id,
    ).window_open,
    false,
  );
  await checkin(firstCode, { expected: 409 });
  assert.equal((await church(sp)).data.session.state, "scheduled");
  issued = (await config()).data;
  const code = issued.code;
  assert.notEqual(code, firstCode);
  const read = (await church(sp + "/check-in")).data;
  assert.ok(!JSON.stringify(read).includes(code));
  assert.ok(!JSON.stringify(read).includes("code_hash"));
  const [hashRows] = await db.query(
    "SELECT code_hash FROM church_checkin_settings WHERE session_id=?",
    [session.id],
  );
  assert.equal(
    hashRows[0].code_hash,
    createHash("sha256").update(code).digest("hex"),
  );
  await church(sp + "/check-in", {
    method: "PUT",
    body: { version: 1, enabled: false },
    expected: 409,
  });
  await checkin(firstCode, { expected: 403 });
  await checkin(code, { cookie: uc, expected: 403 });
  const simultaneous = await Promise.all([checkin(code), checkin(code)]);
  assert.equal(
    simultaneous.filter((r) => r.data.receipt.already_checked_in).length,
    1,
  );
  assert.equal((await church(sp)).data.session.state, "open");
  assert.equal((await church(sp)).data.stats.present, 1);
  const [counts] = await db.query(
    "SELECT COUNT(*) n FROM church_self_checkins WHERE session_id=? AND member_id=?",
    [session.id, m.id],
  );
  assert.equal(Number(counts[0].n), 1);
  const own = (await publicCall("/dashboard")).data;
  assert.equal(own.linked, true);
  assert.ok(own.sessions.find((s) => s.id === session.id).checked_in);
  assert.ok(!JSON.stringify(own).includes(b.email));
  assert.ok(!JSON.stringify(own).includes("Self Two"));
  const roster = (await church(sp + "/roster?search=Self%20One")).data
    .roster[0];
  assert.ok(roster.self_checked_in_at);
  const mark = async (memberId, status) => {
    const row = (await church(sp + "/roster?limit=100")).data.roster.find(
      (r) => r.id === memberId,
    );
    return church(sp + "/attendance", {
      method: "POST",
      body: {
        entries: [
          { member_id: memberId, status, record_version: row.record_version },
        ],
      },
    });
  };
  // Several services can prepare their initial roster at once; no deadlock may lose an arrival.
  const arrivals = [];
  for (let n = 0; n < 4; n++) {
    const service = (
      await church("/sessions", {
        method: "POST",
        body: { ...payload, title: "Concurrent arrival " + n },
      })
    ).data.session;
    const cfg = (
      await church(`/sessions/${service.id}/check-in`, {
        method: "PUT",
        body: {
          version: service.version,
          enabled: true,
          opens_at: time(-10),
          closes_at: time(60),
        },
      })
    ).data;
    arrivals.push({ id: service.id, code: cfg.code });
  }
  await Promise.all(
    arrivals.flatMap((service) =>
      [ac, bc].map((cookie) =>
        publicCall(`/sessions/${service.id}/check-in`, {
          method: "POST",
          cookie,
          body: { code: service.code },
        }),
      ),
    ),
  );
  for (const service of arrivals)
    assert.equal(
      (await church("/sessions/" + service.id)).data.stats.present,
      2,
    );
  await mark(m2.id, "absent");
  await checkin(code, { cookie: bc, expected: 409 });
  await mark(m2.id, "unmarked");
  await checkin(code, { cookie: bc, body: { code, member_id: m.id } });
  assert.equal((await church(sp)).data.stats.present, 2);
  await db.query("UPDATE public_accounts SET status='suspended' WHERE id=?", [
    b.id,
  ]);
  await publicCall("/dashboard", { cookie: bc, expected: 401 });
  await db.query("UPDATE public_accounts SET status='active' WHERE id=?", [
    b.id,
  ]);
  m = (await church("/members/" + m.id)).data.member;
  await church(`/members/${m.id}/archive`, {
    method: "POST",
    body: { version: m.version, archived: true },
  });
  assert.equal((await publicCall("/dashboard")).data.linked, false);
  await checkin(code, { expected: 403 });
  m = (await church("/members/" + m.id)).data.member;
  await church(`/members/${m.id}/archive`, {
    method: "POST",
    body: { version: m.version, archived: false },
  });
  await db.query("DELETE FROM church_checkin_limits WHERE account_id=?", [
    a.id,
  ]);
  await config({ closes_at: time(-1) });
  await checkin(code, { expected: 409 });
  issued = (await config()).data;
  const currentCode = issued.code;
  const currentSession = (await church(sp)).data.session;
  await church(sp + "/state", {
    method: "POST",
    body: { version: currentSession.version, state: "closed" },
  });
  await checkin(currentCode, { expected: 409 });
  await church(sp + "/state", {
    method: "POST",
    body: { version: (await church(sp)).data.session.version, state: "open" },
  });
  await church(sp, {
    method: "PUT",
    body: {
      ...payload,
      starts_at: time(31),
      ends_at: time(91),
      version: (await church(sp)).data.session.version,
      guest_count: 0,
    },
  });
  assert.equal(
    (await church(sp + "/check-in")).data.configuration.enabled,
    false,
  );
  await checkin(currentCode, { expected: 409 });
  const audit = (await church("/activity?limit=100")).data.activity;
  assert.ok(
    audit.some(
      (a) =>
        a.action === "attendance.self_checkin" &&
        a.actor_name === "Member self check-in",
    ),
  );
  assert.ok(!JSON.stringify(audit).includes(currentCode));
  await config();
  await db.query("DELETE FROM church_checkin_limits WHERE account_id=?", [
    a.id,
  ]);
  for (let i = 0; i < 12; i++) await checkin("00000000", { expected: 403 });
  const limited = await checkin("00000000", { expected: 429 });
  assert.equal(limited.response.headers.get("retry-after"), "900");
  // Several arriving members share one venue IP; failures for unrelated identities do not exhaust a 20-person IP bucket.
  for (let i = 0; i < 22; i++)
    await call("/api/public/login", {
      method: "POST",
      body: { email: `unknown${i}@checkin.example.test`, password },
      expected: 401,
    });
  return { cookie: ac, path: "/api/public/church" + sp + "/check-in" };
}
