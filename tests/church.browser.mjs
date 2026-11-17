import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
const root = fileURLToPath(new URL("../", import.meta.url)),
  database = `church_browser_${Date.now()}_${process.pid}`;
const db = await mysql.createConnection({
  host: process.env.PAI_TEST_DB_HOST || "127.0.0.1",
  port: Number(process.env.PAI_TEST_DB_PORT || 3306),
  user: process.env.PAI_TEST_DB_USER || "root",
  password: process.env.PAI_TEST_DB_PASSWORD || "",
});
await db.query(`CREATE DATABASE \`${database}\``);
await db.query(`USE \`${database}\``);
const portSocket = createServer();
await new Promise((resolve) => portSocket.listen(0, "127.0.0.1", resolve));
const port = portSocket.address().port;
await new Promise((resolve) => portSocket.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server,
  browser,
  logs = "";
try {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DB_HOST: process.env.PAI_TEST_DB_HOST || "127.0.0.1",
      DB_PORT: process.env.PAI_TEST_DB_PORT || "3306",
      DB_USER: process.env.PAI_TEST_DB_USER || "root",
      DB_PASSWORD: process.env.PAI_TEST_DB_PASSWORD || "",
      DB_NAME: database,
      ADMIN_EMAIL: "browser-owner@example.test",
      ADMIN_INITIAL_PASSWORD: "browser-test-password",
      ADMIN_FORCE_RESET: "",
      ADMIN_PASSKEY: "",
      PAI_DATA_DIR: "",
      PAI_PUBLIC_ACCOUNTS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/api/health/db")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    timezoneId: "Europe/Paris",
    locale: "en-GB",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [],
    failures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 500)
      failures.push(r.status() + " " + new URL(r.url()).pathname);
  });
  page.on("dialog", (d) => d.accept());
  const nav = async (name) => {
    await page.locator('#church-nav [data-view="' + name + '"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#page-content")?.getAttribute("aria-busy") !==
        "true",
    );
  };
  const close = () => page.locator("#dialog-close").click();
  async function login(email) {
    await page.locator("#login-form [name=email]").fill(email);
    await page
      .locator("#login-form [name=password]")
      .fill("browser-test-password");
    await page.locator("#login-form button[type=submit]").click();
    await page.locator("#church-app").waitFor({ state: "visible" });
    await page
      .getByRole("heading", { name: "A place for every person." })
      .waitFor();
  }
  async function noOverflow(label) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        label + " overflow at " + width,
      );
    }
  }
  await page.goto(base + "/church");
  await page.locator("#church-login").waitFor({ state: "visible" });
  await login("browser-owner@example.test");
  await noOverflow("Overview");
  await nav("households");
  await page.locator("#page-actions [data-action=new-household]").click();
  await page.locator("#household-form [name=name]").fill("Mensah household");
  await page.locator("#household-form [name=phone]").fill("+233200000002");
  await page
    .locator("#household-form [name=address]")
    .fill("Fictional test address");
  await page.locator("#household-form button[type=submit]").click();
  await page
    .locator("#edit-dialog #dialog-title")
    .filter({ hasText: "Mensah household" })
    .waitFor();
  await close();
  await nav("members");
  await page.locator("#page-actions [data-action=new-member]").click();
  await page.locator("#member-form [name=first_name]").fill("Amina");
  await page.locator("#member-form [name=last_name]").fill("Mensah");
  await page.locator("#member-form [name=email]").fill("amina@example.test");
  await page.locator("#member-form [name=phone]").fill("+233200000001");
  await page.locator("#member-form [name=birth_date]").fill("1990-01-02");
  await page
    .locator("#member-form [name=membership_status]")
    .selectOption("member");
  await page
    .locator("#member-form [name=household_id]")
    .selectOption({ label: "Mensah household" });
  await page
    .locator("#member-form [name=relationship]")
    .fill("Primary contact");
  await page.locator("#member-form button[type=submit]").click();
  await page
    .locator("#dialog-title")
    .filter({ hasText: "Amina Mensah" })
    .waitFor();
  assert.match(await page.locator("#dialog-body").innerText(), /2 Jan 1990/);
  await page.locator("#dialog-body [data-action=edit-member]").click();
  await page.locator("#member-form [name=phone]").fill("+233200000003");
  await page.locator("#member-form button[type=submit]").click();
  await page.getByText("+233200000003", { exact: true }).waitFor();
  await close();
  await nav("households");
  await page
    .locator("#households-table [data-action=household]")
    .first()
    .click();
  await page.locator("#dialog-body [data-action=edit-household]").click();
  await page
    .locator("#household-form [name=primary_contact_id]")
    .selectOption({ label: "Amina Mensah" });
  await page.locator("#household-form button[type=submit]").click();
  await page
    .locator("#dialog-body .badge")
    .filter({ hasText: "Primary contact" })
    .waitFor();
  await close();
  await noOverflow("Households");
  await nav("members");
  await page.locator("#page-actions [data-action=new-member]").click();
  await page.locator("#member-form [name=first_name]").fill("Kojo");
  await page.locator("#member-form [name=last_name]").fill("Mensah");
  await page
    .locator("#member-form [name=household_id]")
    .selectOption({ label: "Mensah household" });
  await page.locator("#member-form button[type=submit]").click();
  await page
    .locator("#dialog-title")
    .filter({ hasText: "Kojo Mensah" })
    .waitFor();
  await close();
  await page.locator("#page-actions [data-action=import-members]").click();
  await page.locator("#import-file").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'first_name,last_name,email,membership_status\nEsi,Boateng,esi@example.test,member\n"<img src=x onerror=""window.__churchXSS=1"">",Safe,,visitor\n',
    ),
  });
  await page.locator("[data-action=commit-import]:enabled").waitFor();
  await page.locator("[data-action=commit-import]").click();
  await page.locator("#edit-dialog").waitFor({ state: "hidden" });
  await page
    .locator("#members-table")
    .getByRole("button", { name: "Esi Boateng", exact: true })
    .waitFor();
  assert.equal(await page.locator("#members-table img").count(), 0);
  assert.equal(await page.evaluate(() => window.__churchXSS), undefined);
  await noOverflow("Members");
  await nav("attendance");
  await page.locator("#page-actions [data-action=new-session]").click();
  await page.locator("#session-form [name=title]").fill("Sunday worship");
  await page.locator("#session-form [name=location]").fill("Main hall");
  await page.locator("#session-form [name=starts_at]").fill("2026-11-17T10:00");
  await page.locator("#session-form [name=ends_at]").fill("2026-11-17T12:00");
  await page.locator("#session-form button[type=submit]").click();
  await page
    .getByRole("heading", { name: "Sunday worship", exact: true })
    .waitFor();
  await page
    .locator("[data-action=set-session-state][data-state=open]")
    .click();
  await page.locator("[data-attendance]").first().waitFor();
  assert.equal(await page.locator("[data-attendance]").count(), 4);
  await page.locator("[data-action=mark-page]").click();
  assert.match(await page.locator("#pending-note").innerText(), /4 unsaved/);
  await page.locator("[data-action=save-attendance]").click();
  await page.locator("[data-action=save-attendance]:disabled").waitFor();
  assert.equal(
    await page
      .locator("[data-attendance]")
      .evaluateAll((xs) => xs.filter((x) => x.value === "present").length),
    4,
  );
  await page.locator("[data-action=edit-session]").click();
  await page.locator("#session-form [name=guest_count]").fill("2");
  await page.locator("#session-form button[type=submit]").click();
  await page
    .getByRole("heading", { name: "Sunday worship", exact: true })
    .waitFor();
  await page
    .locator("[data-action=set-session-state][data-state=closed]")
    .click();
  await page.locator("[data-attendance]:disabled").first().waitFor();
  assert.equal(await page.locator("[data-attendance]:enabled").count(), 0);
  await noOverflow("Attendance register");
  const [time] = await db.query(
    "SELECT DATE_FORMAT(starts_at,'%Y-%m-%d %H:%i:%s') t FROM church_sessions",
  );
  assert.equal(
    time[0].t,
    "2026-11-17 09:00:00",
    "Local scheduling uses the selected browser timezone",
  );
  await nav("reports");
  await page.locator("#report-form [name=from]").fill("2026-11-01");
  await page.locator("#report-form [name=through]").fill("2026-11-30");
  await page.locator("#report-form button[type=submit]").click();
  await page
    .locator("#report-results td")
    .filter({ hasText: "Sunday worship" })
    .waitFor();
  assert.equal(
    await page.locator(".report-metrics .metric strong").first().innerText(),
    "6",
  );
  await noOverflow("Reports");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-action=export-report]").click();
  const downloaded = await downloadPromise;
  assert.equal(downloaded.suggestedFilename(), "church-attendance.csv");
  assert.match(
    await readFile(await downloaded.path(), "utf8"),
    /Sunday worship/,
  );
  await nav("members");
  await page
    .locator("#members-table")
    .getByRole("button", { name: "Amina Mensah", exact: true })
    .click();
  await page.locator("[data-action=member-history]").click();
  await page
    .locator("#member-history")
    .getByText("Sunday worship", { exact: true })
    .waitFor();
  await page.locator("[data-action=archive-member]").click();
  await page
    .locator("#dialog-body .badge")
    .filter({ hasText: "Archived" })
    .waitFor();
  await close();
  assert.equal(
    await page
      .locator("#members-table")
      .getByRole("button", { name: "Amina Mensah", exact: true })
      .count(),
    0,
  );
  await page.locator("#member-archived").selectOption("true");
  await page
    .locator("#members-table")
    .getByRole("button", { name: "Amina Mensah", exact: true })
    .click();
  await page.locator("[data-action=archive-member]").click();
  await page
    .locator("[data-action=archive-member]")
    .filter({ hasText: "Archive record" })
    .waitFor();
  await close();
  await page.locator("#member-archived").selectOption("false");
  await page
    .locator("#members-table")
    .getByRole("button", { name: "Amina Mensah", exact: true })
    .waitFor();
  await nav("activity");
  await page.locator(".activity-item").first().waitFor();
  await noOverflow("Activity");
  const created = await context.request.post(
    base + "/api/functions/v1/admin-users",
    {
      headers: { Origin: base },
      data: {
        action: "create_user",
        payload: {
          email: "browser-usher@example.test",
          password: "browser-test-password",
          name: "Attendance usher",
          role: "usher",
        },
      },
    },
  );
  assert.equal(created.status(), 200);
  const unsafeList = await context.request.get(
    base + "/api/church/members?search=Safe",
  );
  const unsafeMember = (await unsafeList.json()).members[0];
  if (unsafeMember)
    await context.request.put(base + "/api/church/members/" + unsafeMember.id, {
      headers: { Origin: base },
      data: { ...unsafeMember, first_name: "Kofi", last_name: "Owusu" },
    });
  await nav("overview");
  if (process.env.PAI_BROWSER_SCREENSHOT)
    await page.screenshot({
      path: process.env.PAI_BROWSER_SCREENSHOT,
      fullPage: true,
    });
  await page.locator("#sign-out").click();
  await page.locator("#church-login").waitFor({ state: "visible" });
  assert.equal(await page.locator("#page-content").innerText(), "");
  assert.equal(await page.locator("#dialog-body").innerText(), "");
  assert.ok(!(await page.locator("body").innerText()).includes("Amina"));
  await login("browser-usher@example.test");
  assert.equal(
    await page.locator("#church-nav [data-view=members]").isVisible(),
    false,
  );
  assert.equal(
    await page.locator("#church-nav [data-view=reports]").isVisible(),
    false,
  );
  await nav("attendance");
  await page.locator("#sessions-table [data-action=register]").first().click();
  await page.locator("[data-attendance]").first().waitFor();
  assert.ok(
    !(await page.locator("body").innerText()).includes("amina@example.test"),
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes("+233200000003"),
  );
  assert.equal(
    (await context.request.get(base + "/api/church/members")).status(),
    403,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  await context.close();
  console.log(
    "PASS church browser: real member/household CRUD, CSV preview/import, XSS escaping, timezone scheduling, attendance save/lock, reports/download, archive/restore, responsive views, logout clearing and usher privacy",
  );
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null)
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill();
    });
  await db.query(`DROP DATABASE \`${database}\``);
  await db.end();
}
