/* Engine factory. This is the single entry point generation/UI code should
   use to get an Engine — never `new` a provider class directly, so switching
   providers/modes stays a one-line change at the call site. */

import "server-only";

import type { EngineMode, Provider } from "@/lib/ai/types";
import type { Engine, EngineCapabilities, UsageHandler } from "./types";
import { EngineError } from "./types";
import { OpenAIEngine, type FallbackPricing, type ModelChains } from "./openai";
import { AnthropicEngine } from "./anthropic";
import { LocalEngine } from "./local";

export * from "./types";

/* OpenRouter: free (:free) models first, then the cheapest paid models as a
   safety net. Free models are rate-limited (about 20 req/min, and a daily cap
   per key), so a 429 or a stall just moves the call to the next model in the
   chain. The free models here all support structured (json_schema) output.
   "fast" carries most calls (chunk notes, flashcards, chat); "strong" is the
   tough-reasoning tier (quizzes, synthesis). Prices are per 1M tokens
   in / out, Sep 2026. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_CHAINS: ModelChains = {
  fast: [
    "nvidia/nemotron-3-super-120b-a12b:free", // free
    "qwen/qwen3.8-27b:free", //                  free
    "nvidia/nemotron-3-super-120b-a12b", //      $0.08 / $0.45
    "google/gemini-2.5-flash", //                $0.30 / $2.50
  ],
  strong: [
    "qwen/qwen3.8-27b:free", //                  free
    "nvidia/nemotron-3-super-120b-a12b:free", // free
    "google/gemini-2.5-flash", //                $0.30 / $2.50
    "nvidia/nemotron-3-ultra-550b-a55b", //      $0.60 / $2.40
  ],
  // Priced per second of audio: ~$0.01/hour, then ~$0.03/hour.
  transcription: ["openai/whisper-large-v3-turbo", "openai/whisper-large-v3"],
  // One model only: vectors from different models can't be compared.
  embeddings: ["openai/text-embedding-3-small"],
  // Cheapest speech model on OpenRouter: $0.62 per 1M characters (~1-2¢ a
  // podcast). OpenAI voice names are mapped to Kokoro's in kokoroVoice().
  // No second model: Kokoro is served by two providers and OpenRouter fails
  // over between them, and other models' voice catalogs don't match.
  tts: ["hexgrad/kokoro-82m"],
};

/* List prices for calls OpenRouter returns without a cost (speech in and
   out), used only to estimate ai_usage.cost_usd. Sep 2026. */
export const OPENROUTER_FALLBACK_PRICING: Record<string, FallbackPricing> = {
  "hexgrad/kokoro-82m": { usdPerChar: 0.62 / 1_000_000 },
  "openai/whisper-large-v3-turbo": { usdPerSecond: 0.01 / 3600 },
  "openai/whisper-large-v3": { usdPerSecond: 0.03 / 3600 },
};

const OPENROUTER_CAPS: EngineCapabilities = { chat: true, transcription: true, tts: true, embeddings: true };

export interface CreateEngineOptions {
  mode: EngineMode;
  provider?: Provider;
  apiKey?: string;
  model?: string;
  localBaseUrl?: string;
  /* Receives every successful call's tokens and cost (ai_usage logging). */
  onUsage?: UsageHandler;
}

export function createEngine(opts: CreateEngineOptions): Engine {
  if (opts.mode === "local") {
    return new LocalEngine(opts.localBaseUrl, opts.model);
  }

  if (!opts.apiKey) {
    throw new EngineError("An API key is required for cloud mode.", "auth");
  }

  switch (opts.provider) {
    case "anthropic":
      return new AnthropicEngine(opts.apiKey, opts.model);
    case "openai":
      return new OpenAIEngine(opts.apiKey, opts.model, { onUsage: opts.onUsage });
    case "openrouter":
      return new OpenAIEngine(opts.apiKey, opts.model, {
        provider: "openrouter",
        baseUrl: OPENROUTER_BASE_URL,
        chains: OPENROUTER_DEFAULT_CHAINS,
        capabilities: OPENROUTER_CAPS,
        pricing: OPENROUTER_FALLBACK_PRICING,
        onUsage: opts.onUsage,
      });
    default:
      throw new EngineError("A provider (openai, anthropic or openrouter) is required for cloud mode.", "unknown");
  }
}

/* Cheap liveness/credentials check without the caller needing to hold onto
   the Engine instance. Throws EngineError on failure. */
export async function validateCredentials(opts: CreateEngineOptions): Promise<void> {
  await createEngine(opts).validate();
}
