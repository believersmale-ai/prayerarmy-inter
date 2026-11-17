import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
test("Vercel preview contains only public assets and excludes application sources and private files", async () => {
  await promisify(execFile)(
    process.execPath,
    ["scripts/build-static-preview.mjs"],
    { cwd: root },
  );
  const config = JSON.parse(await readFile(root + "vercel.json", "utf8"));
  assert.equal(config.outputDirectory, ".vercel-static");
  assert.equal(config.buildCommand, "node scripts/build-static-preview.mjs");
  for (const file of [
    "index.html",
    "admin.html",
    "church-management.html",
    "member-portal.html",
    "portal-shell.js",
    "member-portal.js",
    "assets/images/prayer-army-logo.png",
  ])
    await access(root + ".vercel-static/" + file);
  for (const file of [
    "api",
    "server.js",
    "database.js",
    "public-auth.js",
    "church-management.js",
    "node-auth.js",
    "migrations",
    "tests",
    "docs",
    "node_modules",
    ".env",
    "assets/uploads",
  ])
    await assert.rejects(
      access(root + ".vercel-static/" + file),
      { code: "ENOENT" },
      file,
    );
  assert.ok(
    config.rewrites.some(
      (r) => r.source === "/member" && r.destination === "/member-portal.html",
    ),
  );
  assert.ok(
    config.rewrites.some(
      (r) =>
        r.source === "/church" && r.destination === "/church-management.html",
    ),
  );
});
