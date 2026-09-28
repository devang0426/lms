import "server-only";

import { recordUsage } from "../usage";
import { createEngine } from "./index";
import { resilient } from "./resilient";
import type { Engine } from "./types";
import { EngineError } from "./types";

/* The one way app and task code gets an Engine: the university's OpenRouter
   key from the environment, wrapped with retry/backoff. The key never leaves
   the server. Every call's cost goes to ai_usage — wrap work in
   withUsage(feature, userId, fn) from lib/ai/usage.ts to attribute it. */
let cached: Engine | null = null;

export function getEngine(): Engine {
  if (cached) return cached;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new EngineError("OPENROUTER_API_KEY is not set on the server.", "auth");
  }
  cached = resilient(createEngine({ mode: "cloud", provider: "openrouter", apiKey, onUsage: recordUsage }));
  return cached;
}
