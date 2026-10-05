import { ffmpeg } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

// The CLI reads this file before any .env, so load the project ref here.
config({ path: ".env.local", quiet: true });

/* Trigger.dev (feature 09). Tasks live in ./trigger. Set DATABASE_URL,
   DATABASE_URL_POOLED, BLOB_READ_WRITE_TOKEN and OPENROUTER_API_KEY in the
   Trigger.dev dashboard for both dev and prod, plus NEXT_PUBLIC_APP_URL
   (feature 33: a data export's links to files; without it they're paths)
   and DEMO_MODE as on Vercel (the daily erase sweep skips the demo accounts
   only when it's "true"). The full list is in context/demo-runbook.md. */
// Trigger.dev's cloud build re-reads this file where no .env exists, so the
// ref (not a secret: it's in every dashboard URL) has a literal fallback.
const project = process.env.TRIGGER_PROJECT_REF ?? "proj_wlyvxhwdxatszvquczwl";

export default defineConfig({
  project,
  dirs: ["./trigger"],
  // Plain "node" is Node 21, which Trigger.dev has deprecated (feature 26).
  runtime: "node-22",
  // Per-task maxDuration overrides this; video tasks set their own.
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2, randomize: true },
  },
  build: {
    // lib/ marks server modules with `server-only`, which only resolves to
    // its no-op build under the react-server condition.
    conditions: ["react-server"],
    extensions: [ffmpeg()],
    // jsdom (under isomorphic-dompurify, used by lib/markdown) reads its own
    // CSS file from disk when imported, which breaks once bundled. Kept
    // external, it's installed in the image with its files intact.
    external: ["jsdom"],
  },
});
