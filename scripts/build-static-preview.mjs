// Vercel is a static preview. Only explicitly public assets belong in its output.
import { readFile, mkdir, rm, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = join(root, ".vercel-static");
const server = await readFile(join(root, "server.js"), "utf8");
const declaration = server.match(/const PUBLIC_FILES = \[([\s\S]*?)\];/);
if (!declaration) throw Error("Public file list could not be read");
const files = [...declaration[1].matchAll(/["']([^"']+)["']/g)].map(
  (m) => m[1],
);
files.push("church-management.html", "member-portal.html");
const privateFile =
  /^(server|database|public-auth|church-management|node-.+)\.js$|\.(php|sql|env|map)$/i;
for (const file of files)
  if (file.includes("/") || file.includes("\\") || privateFile.test(file))
    throw Error("Unexpected public preview file: " + file);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of files) await copyFile(join(root, file), join(out, file));
const media =
  /\.(png|jpe?g|svg|webp|gif|ico|avif|mp4|webm|mp3|wav|ogg|pdf|woff2?|ttf|srt|vtt)$/i;
async function assets(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const src = join(source, entry.name),
      dest = join(destination, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "uploads") await assets(src, dest);
    } else if (entry.isFile() && media.test(entry.name))
      await copyFile(src, dest);
  }
}
await assets(join(root, "assets"), join(out, "assets"));
console.log(
  "Static preview built from the public file allowlist; backend, configuration and private data excluded.",
);
