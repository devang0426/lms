/* No secret may reach the browser (feature 23; success criterion 5).
   Run after `npm run build`:  npm run check:secrets
   Scans everything Next.js serves to the browser (.next/static) for:
   - the actual values of the server-only env vars that are set (so a
     leaked real key is caught whatever its shape), and
   - the shapes of the keys this app uses, in case a different value
     leaked.
   Exits 1 and names the file and the kind of secret, never the secret. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), ".next", "static");

const SERVER_ONLY = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_POOLED",
  "BLOB_READ_WRITE_TOKEN",
  "TRIGGER_SECRET_KEY",
  "OPENROUTER_API_KEY",
];

const SHAPES = [
  ["Clerk secret key", /sk_(test|live)_[A-Za-z0-9]{20,}/],
  ["Clerk webhook secret", /whsec_[A-Za-z0-9+/=]{20,}/],
  ["OpenRouter key", /sk-or-v1-[a-f0-9]{32,}/],
  ["Vercel Blob token", /vercel_blob_rw_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["Trigger.dev secret key", /tr_(dev|prod|stg)_[A-Za-z0-9]{16,}/],
  ["Postgres URL with a password", /postgres(ql)?:\/\/[^\s"'`:@/]+:[^\s"'`@/]+@/],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(js|mjs|css|json|html|txt|map)$/.test(name)) yield full;
  }
}

let root;
try {
  root = statSync(ROOT);
} catch {
  root = null;
}
if (!root?.isDirectory()) {
  console.error("No .next/static: run `npm run build` first.");
  process.exit(2);
}

const values = SERVER_ONLY.flatMap((name) => {
  const v = process.env[name];
  return v && v.length >= 12 && !/x{8,}/.test(v) ? [[name, v]] : [];
});

const hits = [];
let scanned = 0;
for (const file of files(ROOT)) {
  scanned++;
  const text = readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file);
  for (const [name, v] of values) if (text.includes(v)) hits.push(`${rel}: the value of ${name}`);
  for (const [label, re] of SHAPES) if (re.test(text)) hits.push(`${rel}: something shaped like a ${label}`);
}

if (hits.length) {
  console.error(`Secrets in the client bundle (${hits.length}):\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`No secrets in the client bundle: ${scanned} files checked, ${values.length} server-only values and ${SHAPES.length} key shapes.`);
