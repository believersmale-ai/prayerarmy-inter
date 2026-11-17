import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export async function runVolunteerBrowser({
  page,
  context,
  base,
  nav,
  close,
  noOverflow,
}) {
  await nav("groups");
  await page
    .locator("#groups-table")
    .getByRole("button", { name: "Welcome team", exact: true })
    .click();
  await page.locator("[data-action=group-add]").waitFor();
  for (const name of ["Amina", "Kojo"]) {
    await page.locator("[data-action=group-add]").click();
    await page.locator("#group-person-search").fill(name);
    await page.locator("#group-find button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#group-person-picker")?.options.length === 2,
    );
    await page.locator("#group-person-picker").selectOption({ index: 1 });
    await page.locator("#group-person-form button[type=submit]").click();
    await page
      .locator("#page-content td")
      .getByRole("button", { name: new RegExp("^" + name) })
      .waitFor();
  }
  const create = async (title, capacity = 1) => {
    await nav("volunteers");
    await page.locator("[data-action=new-shift]").click();
    await page.locator("#shift-form [name=title]").fill(title);
    await page.locator("#shift-form [name=role_label]").fill("Greeter");
    await page.waitForFunction(
      () => document.querySelector("#shift-group-picker")?.options.length > 1,
    );
    await page
      .locator("#shift-group-picker")
      .selectOption({ label: "Welcome team" });
    await page.locator("#shift-form [name=starts_at]").fill("2030-06-09T10:00");
    await page.locator("#shift-form [name=ends_at]").fill("2030-06-09T12:00");
    await page.locator("#shift-form [name=capacity]").fill(String(capacity));
    await page
      .locator("#shift-form [name=instructions]")
      .fill("Welcome everyone. <img src=x onerror=alert(1)>");
    await page.locator("#shift-form button[type=submit]").click();
    await page.locator("#page-content h3").filter({ hasText: title }).waitFor();
    assert.equal(await page.locator("#page-content img").count(), 0);
  };
  const assign = async (name, error = "") => {
    await page.locator("[data-action=assign-volunteer]").click();
    await page.locator("#volunteer-search").fill(name);
    await page.locator("#volunteer-find button").click();
    await page.waitForFunction(
      () => document.querySelector("#volunteer-picker")?.options.length === 2,
    );
    await page.locator("#volunteer-picker").selectOption({ index: 1 });
    await page.locator("#volunteer-form button[type=submit]").click();
    if (error) {
      await page.locator("#form-error").filter({ hasText: error }).waitFor();
      await close();
    } else
      await page
        .locator("#page-content td")
        .getByRole("button", { name: new RegExp("^" + name) })
        .waitFor();
  };
  await create("Sunday welcome");
  const shifts = await (
    await context.request.get(base + "/api/church/shifts?search=Sunday")
  ).json();
  const first = shifts.shifts[0];
  assert.equal(first.starts_at, "2030-06-09T08:00:00.000Z");
  assert.equal(first.ends_at, "2030-06-09T10:00:00.000Z");
  await assign("Amina");
  await assign("Kojo", "This shift is full");
  await page.locator("[data-action=edit-shift]").click();
  await page.locator("#shift-form [name=capacity]").fill("2");
  await page.locator("#shift-form button[type=submit]").click();
  await page.locator("#edit-dialog").waitFor({ state: "hidden" });
  await page.locator("[data-action=assign-volunteer]").waitFor();
  await assign("Kojo");
  const amina = page
    .locator("#page-content tbody tr")
    .filter({ hasText: "Amina Mensah" });
  await amina.locator("[data-action=volunteer-status]").click();
  await page
    .locator("#volunteer-status-form [name=status]")
    .selectOption("served");
  await page.locator("#volunteer-status-form button[type=submit]").click();
  await amina.getByText("Served", { exact: true }).waitFor();
  await noOverflow("Volunteer shift");
  const downloaded = page.waitForEvent("download");
  await page.locator("[data-action=export-shift]").click();
  const csv = await downloaded;
  assert.equal(csv.suggestedFilename(), "church-volunteer-roster.csv");
  const contents = await readFile(await csv.path(), "utf8");
  assert.match(contents, /Sunday welcome/);
  assert.match(contents, /Amina Mensah/);
  assert.match(contents, /served/);
  await page.locator("[data-action=shift-state][data-state=completed]").click();
  await page
    .locator("[data-action=shift-state][data-state=scheduled]")
    .waitFor();
  assert.equal(await page.locator("[data-action=assign-volunteer]").count(), 0);
  assert.equal(await page.locator("[data-action=volunteer-status]").count(), 0);
  await page.locator("[data-action=shift-state][data-state=scheduled]").click();
  await page
    .locator("[data-action=shift-state][data-state=cancelled]")
    .waitFor();
  await page.locator("[data-action=shift-state][data-state=cancelled]").click();
  await page
    .locator("[data-action=shift-state][data-state=scheduled]")
    .waitFor();
  await page.locator("[data-action=shift-state][data-state=scheduled]").click();
  await page.locator("[data-action=assign-volunteer]").waitFor();
  const kojo = page
    .locator("#page-content tbody tr")
    .filter({ hasText: "Kojo Mensah" });
  await kojo.locator("[data-action=remove-volunteer]").click();
  await kojo.waitFor({ state: "hidden" });
  await create("Sunday overlapping");
  await assign("Amina", "overlapping shift");
  await nav("volunteers");
  await page.locator("#shift-filters [name=search]").fill("Sunday");
  await page.locator("#shift-filters [name=from]").fill("2030-06-09");
  await page.locator("#shift-filters [name=to]").fill("2030-06-09");
  await page.locator("#shift-filters button[type=submit]").click();
  await page
    .locator("#shifts-table")
    .getByRole("button", { name: "Sunday welcome", exact: true })
    .waitFor();
  await noOverflow("Volunteer schedule");
  if (process.env.PAI_VOLUNTEER_SCREENSHOT)
    await page.screenshot({
      path: process.env.PAI_VOLUNTEER_SCREENSHOT,
      fullPage: true,
    });
  assert.equal(await page.locator("#shifts-table tbody tr").count(), 2);
  // A saved response arriving after the dialog was closed must not reopen it or navigate away.
  await page
    .locator("#shifts-table")
    .getByRole("button", { name: "Sunday welcome", exact: true })
    .click();
  await page
    .locator("#page-content tbody tr")
    .filter({ hasText: "Amina Mensah" })
    .locator("[data-action=volunteer-status]")
    .click();
  await page
    .locator("#volunteer-status-form [name=status]")
    .selectOption("confirmed");
  let release, received;
  const gate = new Promise((r) => {
      release = r;
    }),
    sent = new Promise((r) => {
      received = r;
    });
  const pattern = `**/api/church/shifts/${first.id}/assignments/*`;
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.locator("#volunteer-status-form button[type=submit]").click();
    await sent;
    await close();
    await nav("volunteers");
    const reply = page.waitForResponse((r) =>
      r.url().includes(`/shifts/${first.id}/assignments/`),
    );
    release();
    await reply;
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#edit-dialog").isVisible(), false);
    assert.equal(
      await page.locator("#page-title").innerText(),
      "Ready to serve together.",
    );
  } finally {
    release();
    await page.unroute(pattern);
  }
}
