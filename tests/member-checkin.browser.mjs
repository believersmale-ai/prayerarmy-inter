import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
export async function runMemberCheckinBrowser({
  page,
  context,
  browser,
  base,
  db,
  nav,
  close,
  noOverflow,
}) {
  const salt = randomBytes(16).toString("hex"),
    password = "member-browser-password";
  const [account] = await db.execute(
    "INSERT INTO public_accounts(email,password_hash,display_name,status,email_verified_at) VALUES (?,?,?,'pending',UTC_TIMESTAMP())",
    [
      "amina@example.test",
      `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      "Amina Member",
    ],
  );
  await db.execute(
    "INSERT INTO public_account_roles(account_id,role) VALUES (?,'member')",
    [account.insertId],
  );
  // Staff cookie is reused across portals without asking the owner to sign in twice.
  const manager = await context.newPage(),
    errors = [];
  manager.on("pageerror", (e) => errors.push(e.message));
  manager.on("dialog", (d) => d.accept());
  await manager.goto(base + "/admin");
  await manager.locator("#admin-app").waitFor({ state: "visible" });
  await manager.locator("#portal-find").click();
  await manager.locator(".portal-command input").fill("Team");
  await manager.locator(".portal-command input").press("Enter");
  await manager.locator("#view-team.active").waitFor();
  const application = manager
    .locator("#membership-applications > div")
    .filter({ hasText: "amina@example.test" });
  await application
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await application.waitFor({ state: "hidden" });
  for (const width of [390, 768, 1440]) {
    await manager.setViewportSize({ width, height: 1000 });
    assert.equal(
      await manager.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Website manager overflow at " + width,
    );
  }
  assert.deepEqual(errors, []);
  await manager.close();
  await nav("members");
  await page
    .locator("#members-table")
    .getByRole("button", { name: "Amina Mensah", exact: true })
    .click();
  await page.locator("[data-action=link-account]").click();
  await page
    .locator("[data-action=link-account]")
    .filter({ hasText: "Unlink account" })
    .waitFor();
  await close();
  // Finder supports keyboard navigation and stays inside the signed-in role's available tools.
  await page.keyboard.press("Control+k");
  await page.locator(".portal-command input").fill("Attendance");
  await page.locator(".portal-command input").press("Enter");
  await page.locator("#sessions-table").waitFor();
  const now = Date.now(),
    iso = (n) => new Date(now + n * 60e3).toISOString();
  const created = await context.request.post(base + "/api/church/sessions", {
    headers: { Origin: base },
    data: {
      title: "Member arrival service",
      location: "Main hall",
      starts_at: iso(30),
      ends_at: iso(90),
    },
  });
  assert.equal(created.status(), 201);
  const session = (await created.json()).session;
  await nav("attendance");
  await page
    .locator("#sessions-table")
    .getByRole("button", { name: "Member arrival service", exact: true })
    .click();
  await page.locator("[data-action=member-checkin]").click();
  await page
    .locator("#checkin-settings-form [name=enabled]")
    .selectOption("true");
  const localInput = async (n) =>
    page.evaluate((v) => {
      const d = new Date(v);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }, iso(n));
  await page
    .locator("#checkin-settings-form [name=opens_at]")
    .fill(await localInput(5));
  await page
    .locator("#checkin-settings-form [name=closes_at]")
    .fill(await localInput(60));
  await page.locator("#checkin-settings-form button[type=submit]").click();
  await page.locator("#issued-code").waitFor();
  const firstCode = await page.locator("#issued-code").innerText();
  assert.match(firstCode, /^[0-9A-F]{8}$/);
  await page.locator("[data-action=checkin-done]").click();
  await page.locator("[data-action=member-checkin]").waitFor();
  const memberContext = await browser.newContext({
      timezoneId: "Europe/Paris",
      viewport: { width: 390, height: 900 },
    }),
    member = await memberContext.newPage();
  const memberErrors = [];
  member.on("pageerror", (e) => memberErrors.push(e.message));
  try {
    await member.goto(base + "/member?session=" + session.id);
    await member.locator("#member-login").waitFor({ state: "visible" });
    await member
      .locator("#member-login-form [name=email]")
      .fill("amina@example.test");
    await member.locator("#member-login-form [name=password]").fill(password);
    await member.locator("#member-login-form button").click();
    await member.locator('[data-service="' + session.id + '"]').waitFor();
    assert.equal(
      await member.locator("[data-checkin] button").isDisabled(),
      true,
    );
    // Member buttons become available automatically at the server's opening time.
    const latest = (
      await (
        await context.request.get(base + `/api/church/sessions/${session.id}`)
      ).json()
    ).session;
    const opening = await context.request.put(
      base + `/api/church/sessions/${session.id}/check-in`,
      {
        headers: { Origin: base },
        data: {
          version: latest.version,
          enabled: true,
          opens_at: new Date(Date.now() + 5000).toISOString(),
          closes_at: iso(60),
        },
      },
    );
    assert.equal(opening.status(), 200);
    const dashboard = member.waitForResponse((r) =>
      r.url().endsWith("/api/public/church/dashboard"),
    );
    await member.locator("#member-refresh").click();
    const upcoming = await (await dashboard).json();
    assert.equal(
      upcoming.sessions.find((s) => s.id === session.id).window_open,
      false,
    );
    await member
      .locator("[data-checkin] button:not([disabled])")
      .waitFor({ timeout: 15000 });
    await page.locator("[data-action=member-checkin]").click();
    await page
      .locator("#checkin-settings-form [name=opens_at]")
      .fill(await localInput(-5));
    await page.locator("#checkin-settings-form button[type=submit]").click();
    await page.locator("#issued-code").waitFor();
    const code = await page.locator("#issued-code").innerText();
    assert.notEqual(code, firstCode);
    await page.locator("[data-action=checkin-done]").click();
    await member.locator("#member-refresh").click();
    await member.locator("[data-checkin] button:not([disabled])").waitFor();
    await member.locator("[name=code]").fill(firstCode);
    await member.locator("[data-checkin] button").click();
    await member
      .locator("[data-checkin] .error-text")
      .filter({ hasText: "not valid" })
      .waitFor();
    await member.locator("[name=code]").fill(code);
    await member.locator("[data-checkin] button").click();
    await member.locator(".member-receipt").waitFor();
    assert.equal(await member.locator("[name=code]").count(), 0);
    assert.equal(
      await member
        .locator(".member-history li")
        .filter({ hasText: "Member arrival service" })
        .getByText("Present", { exact: true })
        .count(),
      1,
    );
    assert.equal(
      (await memberContext.request.get(base + "/api/church/members")).status(),
      401,
    );
    await member.locator("#member-refresh").click();
    await member.locator(".member-receipt").waitFor();
    for (const width of [390, 768, 1440]) {
      await member.setViewportSize({ width, height: 900 });
      assert.equal(
        await member.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Member portal overflow at " + width,
      );
    }
    if (process.env.PAI_MEMBER_SCREENSHOT)
      await member.screenshot({
        path: process.env.PAI_MEMBER_SCREENSHOT,
        fullPage: true,
      });
    await page.locator("#portal-refresh").click();
    await page
      .locator("#roster-table")
      .getByText("Member self check-in", { exact: true })
      .waitFor();
    const aminaAttendance = page
      .locator("#roster-table tbody tr")
      .filter({ hasText: "Amina Mensah" })
      .locator("[data-attendance]");
    assert.equal(await aminaAttendance.isEnabled(), true);
    assert.equal(await aminaAttendance.inputValue(), "present");
    const beforeGuestEdit = (
      await (
        await context.request.get(base + `/api/church/sessions/${session.id}`)
      ).json()
    ).session;
    await page.locator("[data-action=edit-session]").click();
    await page.locator("#session-form [name=guest_count]").fill("2");
    await page.locator("#session-form button[type=submit]").click();
    await page.locator("#roster-table").waitFor();
    const afterGuestEdit = (
      await (
        await context.request.get(base + `/api/church/sessions/${session.id}`)
      ).json()
    ).session;
    assert.equal(afterGuestEdit.starts_at, beforeGuestEdit.starts_at);
    assert.equal(afterGuestEdit.ends_at, beforeGuestEdit.ends_at);
    assert.equal(
      (
        await (
          await context.request.get(
            base + `/api/church/sessions/${session.id}/check-in`,
          )
        ).json()
      ).configuration.enabled,
      true,
    );
    await noOverflow("Member arrival register");
    if (process.env.PAI_ADMIN_SCREENSHOT)
      await page.screenshot({
        path: process.env.PAI_ADMIN_SCREENSHOT,
        fullPage: true,
      });
    await context.setOffline(true);
    await page.locator(".portal-offline").waitFor({ state: "visible" });
    await context.setOffline(false);
    await page.locator(".portal-offline").waitFor({ state: "hidden" });
    await member.locator("#member-logout").click();
    await member.locator("#member-login").waitFor({ state: "visible" });
    assert.equal(await member.locator("#member-content").innerText(), "");
    assert.ok(
      !(await member.locator("body").innerText()).includes("Amina Mensah"),
    );
    await member.goto(base + "/");
    for (const width of [390, 768, 1024, 1440]) {
      await member.setViewportSize({ width, height: 900 });
      assert.equal(
        await member.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "Public member navigation overflow at " + width,
      );
    }
    await member.setViewportSize({ width: 390, height: 900 });
    await member.locator(".menu-toggle").click();
    await member.locator('#primary-nav a[href="/member"]').click();
    await member.locator("#member-login").waitFor({ state: "visible" });
    assert.deepEqual(memberErrors, []);
  } finally {
    await memberContext.close();
  }
  // Delayed register responses must not replace a different view after navigation.
  await nav("attendance");
  let release, received;
  const gate = new Promise((r) => (release = r)),
    sent = new Promise((r) => (received = r));
  const pattern = `**/api/church/sessions/${session.id}`;
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page
      .locator("#sessions-table")
      .getByRole("button", { name: "Member arrival service", exact: true })
      .click();
    await sent;
    await nav("groups");
    const reply = page.waitForResponse((r) =>
      r.url().endsWith("/api/church/sessions/" + session.id),
    );
    release();
    await reply;
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.locator("#page-title").innerText(),
      "Serving and growing together.",
    );
    assert.equal(await page.locator("#roster-table").count(), 0);
  } finally {
    release();
    await page.unroute(pattern);
  }
  for (const [view, input] of [
    ["members", "#member-search"],
    ["households", "#household-filter"],
  ]) {
    await nav(view);
    await page.locator(input).fill("Mensah");
    await nav("groups");
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#church-status").isVisible(), false);
  }
  // Closing a member form during a committed request must not resurrect its profile dialog.
  await nav("members");
  await page.locator("[data-action=new-member]").click();
  await page
    .locator("#member-form [name=first_name]")
    .fill("Late reply fixture");
  let releaseSave, saveReceived;
  const saveGate = new Promise((r) => (releaseSave = r)),
    saveSent = new Promise((r) => (saveReceived = r)),
    savePattern = "**/api/church/members";
  await page.route(savePattern, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    saveReceived();
    await saveGate;
    await route.fulfill({ response });
  });
  try {
    await page.locator("#member-form button[type=submit]").click();
    await saveSent;
    await close();
    await nav("groups");
    const reply = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/church/members") &&
        r.request().method() === "POST",
    );
    releaseSave();
    await reply;
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#edit-dialog").isVisible(), false);
    assert.equal(
      await page.locator("#page-title").innerText(),
      "Serving and growing together.",
    );
  } finally {
    releaseSave();
    await page.unroute(savePattern);
  }
}
