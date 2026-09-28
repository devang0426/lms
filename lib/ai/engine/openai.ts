/* OpenAI-dialect implementation of the Engine interface. Server-only.
   Uses the REST API directly via `fetch` — no SDK dependency.

   Two providers share this class:
     • "openrouter" — the university's key against https://openrouter.ai/api/v1
       with per-tier model fallback chains (the default for Studyhall).
     • "openai" — a direct OpenAI key (kept for flexibility). */

import "server-only";

import type {
  ChatMessage,
  CompletionOptions,
  Engine,
  EngineCapabilities,
  EngineUsage,
  StructuredOptions,
  TokenHandler,
  TranscriptResult,
  TranscriptSegment,
  TtsOptions,
  UsageHandler,
} from "./types";
import { EngineError } from "./types";
import { unsupportedMessage, type Task } from "./router";
import { chunkAudioForUpload, type AudioChunk, type AudioDecoder } from "../audio/chunk";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const ALL_CAPS: EngineCapabilities = { chat: true, transcription: true, tts: true, embeddings: true };

/* Ordered model chains for gateways that route to many vendors (OpenRouter).
   The first entry is tried first; the rest are fallbacks, used only when a
   model is down, rate-limited, missing, or rejects the request. */
export interface ModelChains {
  fast: string[];
  strong: string[];
  transcription: string[];
  embeddings: string[];
  tts: string[];
}

/* List prices for calls whose response carries no cost (speech in and
   out), so ai_usage still gets a figure. Rows logged this way are marked
   `estimated`. */
export interface FallbackPricing {
  usdPerChar?: number;
  usdPerSecond?: number;
}

export interface OpenAIEngineOptions {
  baseUrl?: string;
  provider?: "openai" | "openrouter";
  models?: { fast: string; strong: string };
  /* When set, replaces `models` and the fixed whisper/embedding model names. */
  chains?: ModelChains;
  capabilities?: EngineCapabilities;
  /* Test seam for the audio chunker (no AudioContext under Node). */
  audioDecoder?: AudioDecoder;
  /* Called once per successful provider call with its tokens and cost. */
  onUsage?: UsageHandler;
  pricing?: Record<string, FallbackPricing>;
  /* A non-streaming request (structured output) that takes longer than
     this is abandoned and the next model in the chain is tried. */
  requestTimeoutMs?: number;
  /* A stream that sends nothing for this long is abandoned the same way. */
  streamIdleMs?: number;
}

/* A slow upstream model can hold a request open indefinitely; without a
   limit, one stuck provider stalls a whole lesson pipeline (feature 12). */
const REQUEST_TIMEOUT_MS = 180_000;
const STREAM_IDLE_MS = 90_000;

export class OpenAIEngine implements Engine {
  readonly mode = "cloud" as const;
  readonly provider: "openai" | "openrouter";
  private readonly baseUrl: string;
  private readonly models: { fast: string; strong: string };
  private readonly chains?: ModelChains;
  private readonly caps: EngineCapabilities;
  private readonly audioDecoder?: AudioDecoder;
  private readonly onUsage?: UsageHandler;
  private readonly pricing: Record<string, FallbackPricing>;
  private readonly requestTimeoutMs: number;
  private readonly streamIdleMs: number;

  constructor(
    private readonly apiKey: string,
    private readonly modelOverride?: string,
    opts: OpenAIEngineOptions = {},
  ) {
    this.provider = opts.provider ?? "openai";
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.models = opts.models ?? { fast: "gpt-4o-mini", strong: "gpt-4o" };
    this.chains = opts.chains;
    this.caps = opts.capabilities ?? { ...ALL_CAPS };
    this.audioDecoder = opts.audioDecoder;
    this.onUsage = opts.onUsage;
    this.pricing = opts.pricing ?? {};
    this.requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.streamIdleMs = opts.streamIdleMs ?? STREAM_IDLE_MS;
  }

  capabilities(): EngineCapabilities {
    return { ...this.caps };
  }

  async complete(opts: CompletionOptions, onToken?: TokenHandler): Promise<string> {
    /* Fallback only happens before the first token (post() throws on a non-2xx
       answer), so a half-streamed reply is never mixed with another model's. */
    let requested = "";
    let idle: IdleTimeout | null = null;
    const res = await this.withFallback(this.chatChain(opts.tier), (model) => {
      requested = model;
      // One timer per attempt: a model that goes quiet gives way to the next.
      idle?.stop();
      idle = new IdleTimeout(this.streamIdleMs);
      return this.post("/chat/completions", {
        model,
        messages: buildMessages(opts),
        stream: true,
        stream_options: { include_usage: true },
        ...this.usageRequest(),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      }, withSignal(opts.signal, idle.signal));
    }).catch((err) => {
      idle?.stop();
      throw err;
    });
    const timer = idle as IdleTimeout | null;

    if (!res.body) throw new EngineError(`${this.label()} returned an empty stream.`, "unknown");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let usage: unknown;
    let servedBy = requested;

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        timer?.reset();
        chunk = await reader.read();
      } catch (err) {
        timer?.stop();
        throw toNetworkError(err);
      }
      const { done, value } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          if (json.usage) usage = json.usage;
          if (typeof json.model === "string") servedBy = json.model;
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          /* malformed SSE chunk; skip it */
        }
      }
    }
    timer?.stop();
    this.report("chat", servedBy, usage);
    return full;
  }

  async structured<T>(opts: StructuredOptions<T>): Promise<T> {
    /* Parsing sits inside the fallback so a model that answers with broken
       JSON hands over to the next one instead of failing the whole note. */
    return this.withFallback(this.chatChain(opts.tier), async (model) => {
      // Covers the whole answer, body included: structured calls don't stream.
      const signal = withSignal(opts.signal, AbortSignal.timeout(this.requestTimeoutMs));
      const res = await this.post("/chat/completions", {
        model,
        messages: buildMessages(opts),
        stream: false,
        ...this.usageRequest(),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
        },
      }, signal);

      let json;
      try {
        json = await res.json();
      } catch (err) {
        throw toNetworkError(err);
      }
      // Charged whether or not the JSON below parses.
      this.report("structured", typeof json.model === "string" ? json.model : model, json.usage);
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new EngineError(`${this.label()} returned no structured content.`, "unknown");
      }
      try {
        return JSON.parse(stripJsonFence(content)) as T;
      } catch {
        throw new EngineError(`${this.label()} (${model}) returned invalid JSON.`, "unknown");
      }
    });
  }

  async transcribe(audio: Blob, signal?: AbortSignal): Promise<TranscriptResult> {
    this.assertCap("transcription");
    /* OpenRouter's upstream STT providers have small request limits, so audio
       is chunked before upload. NOTE: chunkAudioForUpload decodes with
       WebAudio (browser-only); on the server, feature 10 pre-chunks with
       ffmpeg and passes pieces that already fit, or injects `audioDecoder`. */
    const chunks: AudioChunk[] =
      this.provider === "openrouter"
        ? await chunkAudioForUpload(audio, this.audioDecoder ? { decode: this.audioDecoder } : {})
        : [{ blob: audio, filename: "audio.webm", offsetSeconds: 0 }];

    const texts: string[] = [];
    const segments: TranscriptSegment[] = [];
    let language: string | undefined;
    for (const chunk of chunks) {
      let used = "";
      const res = await this.withFallback(this.chains?.transcription ?? ["whisper-1"], async (model) => {
        used = model;
        const form = new FormData();
        form.append("file", chunk.blob, chunk.filename);
        form.append("model", model);
        form.append("response_format", "verbose_json");

        let r: Response;
        try {
          r = await fetch(`${this.baseUrl}/audio/transcriptions`, {
            method: "POST",
            headers: this.authHeaders(),
            body: form,
            signal,
          });
        } catch (err) {
          throw toNetworkError(err);
        }
        if (!r.ok) throw await this.mapError(r);
        return r;
      });
      const json = await res.json();
      const lastEnd = Array.isArray(json.segments) && json.segments.length ? json.segments.at(-1).end : 0;
      this.report("transcription", used, json.usage, {
        seconds: typeof json.duration === "number" ? json.duration : lastEnd,
      });
      if (typeof json.text === "string" && json.text.trim()) texts.push(json.text.trim());
      if (Array.isArray(json.segments)) {
        for (const s of json.segments as Array<{ start: number; end: number; text: string }>) {
          segments.push({ start: s.start + chunk.offsetSeconds, end: s.end + chunk.offsetSeconds, text: s.text });
        }
      }
      language ??= json.language;
    }
    return { text: texts.join(" "), segments, language };
  }

  async tts(text: string, opts: TtsOptions): Promise<Blob> {
    this.assertCap("tts");
    if (this.chains?.tts.length) {
      let used = "";
      const res = await this.withFallback(this.chains.tts, (model) => {
        used = model;
        return this.post(
          "/audio/speech",
          {
            model,
            voice: model.startsWith("hexgrad/kokoro") ? kokoroVoice(opts.voice) : opts.voice,
            input: text,
            ...(opts.format ? { response_format: opts.format } : {}),
          },
          opts.signal,
        );
      });
      this.report("tts", used, undefined, { chars: text.length });
      return res.blob();
    }
    /* Try TTS models newest→oldest, falling through ONLY when a model is
       inaccessible to this key/project (needs verification or isn't in the
       project's model limits). Any other failure — auth, quota, network,
       bad input — rethrows immediately since retrying a different model
       won't help. */
    const models = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];
    const tried: string[] = [];
    for (const model of models) {
      try {
        const res = await this.post(
          "/audio/speech",
          {
            model,
            voice: opts.voice,
            input: text,
            ...(opts.format ? { response_format: opts.format } : {}),
          },
          opts.signal,
        );
        this.report("tts", model, undefined, { chars: text.length });
        return res.blob();
      } catch (e) {
        if (e instanceof EngineError && e.kind === "model_missing") {
          tried.push(model);
          continue;
        }
        throw e;
      }
    }
    /* Every candidate was inaccessible — name them all so the user knows
       exactly which models to enable, not just the last one attempted. */
    throw new EngineError(
      `Your OpenAI project can't access any text-to-speech model (tried ${tried.join(
        ", ",
      )}). Enable one at platform.openai.com → Settings → Project → Limits, ` +
        `and if your account is new you may also need to verify your organization there.`,
      "model_missing",
    );
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    this.assertCap("embeddings");
    let used = "";
    const res = await this.withFallback(this.chains?.embeddings ?? ["text-embedding-3-small"], (model) => {
      used = model;
      return this.post("/embeddings", { model, input: texts, ...this.usageRequest() }, signal);
    });
    const json = await res.json();
    this.report("embeddings", used, json.usage);
    return (json.data ?? []).map((d: { embedding: number[] }) => d.embedding);
  }

  async validate(): Promise<void> {
    let res: Response;
    /* OpenRouter's /models is public, so it can't tell a bad key from a good
       one; /key is its authenticated "who am I" endpoint. */
    const path = this.provider === "openrouter" ? "/key" : "/models";
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method: "GET", headers: this.headers() });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (res.status === 401) {
      throw new EngineError(`Invalid ${this.label()} API key.`, "auth");
    }
    if (!res.ok) throw await this.mapError(res);
  }

  private label(): string {
    return providerLabel(this.provider);
  }

  /* OpenRouter adds `usage.cost` (USD) to responses when asked. */
  private usageRequest(): Record<string, unknown> {
    return this.provider === "openrouter" ? { usage: { include: true } } : {};
  }

  /* Hand one call's usage to the onUsage hook. Uses the provider's reported
     cost when present, otherwise the fallback price list (speech). */
  private report(
    task: EngineUsage["task"],
    model: string,
    raw: unknown,
    amount: { chars?: number; seconds?: number } = {},
  ): void {
    if (!this.onUsage) return;
    const u = (raw ?? {}) as { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const reported = typeof u.cost === "number" && Number.isFinite(u.cost);
    const price = this.pricing[model] ?? {};
    const estimate = (amount.chars ?? 0) * (price.usdPerChar ?? 0) + (amount.seconds ?? 0) * (price.usdPerSecond ?? 0);
    try {
      this.onUsage({
        task,
        model,
        inputTokens: num(u.prompt_tokens),
        outputTokens: num(u.completion_tokens),
        costUsd: reported ? num(u.cost) : estimate,
        estimated: !reported,
      });
    } catch {
      /* logging must never break the AI call */
    }
  }

  private assertCap(task: Task): void {
    if (!this.caps[task === "transcription" ? "transcription" : task]) {
      throw new EngineError(unsupportedMessage(task, this.provider), "unsupported");
    }
  }

  /* A model the user pinned in Settings always wins and runs alone. */
  private chatChain(tier?: "fast" | "strong"): string[] {
    if (this.modelOverride) return [this.modelOverride];
    if (this.chains) return tier === "strong" ? this.chains.strong : this.chains.fast;
    return [tier === "strong" ? this.models.strong : this.models.fast];
  }

  /* Try each model in order. Errors another model can't fix (bad key, out of
     credit, user cancelled — an AbortError, not an EngineError) stop the chain
     at once; anything else — model down, 429, 5xx, rejected schema, broken
     JSON — moves on to the next. The last model's error is what the user sees
     if every one fails. */
  private async withFallback<R>(models: string[], run: (model: string) => Promise<R>): Promise<R> {
    let last: unknown;
    for (let i = 0; i < models.length; i++) {
      try {
        return await run(models[i]);
      } catch (e) {
        last = e;
        const fatal =
          !(e instanceof EngineError) || e.kind === "auth" || e.kind === "quota";
        if (fatal || i === models.length - 1) throw e;
      }
    }
    throw last;
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", ...this.authHeaders(), ...this.attributionHeaders() };
  }

  /* OpenRouter's optional app attribution (shows Studyhall in its dashboard). */
  private attributionHeaders(): Record<string, string> {
    return this.provider === "openrouter" ? { "X-Title": "Studyhall" } : {};
  }

  /* Shared POST helper: sends JSON, handles network failure + non-2xx mapping. */
  private async post(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await this.mapError(res);
    return res;
  }

  private async mapError(res: Response): Promise<EngineError> {
    return mapError(res, this.provider);
  }
}

function providerLabel(provider: "openai" | "openrouter"): string {
  return provider === "openrouter" ? "OpenRouter" : "OpenAI";
}

/* Kokoro ships look-alikes of the OpenAI voices, prefixed with accent and
   gender (a = American, b = British; f/m). The podcast speaks OpenAI names,
   so translate them; a voice already in Kokoro form passes through. */
const KOKORO_VOICES: Record<string, string> = {
  alloy: "af_alloy",
  nova: "af_nova",
  shimmer: "af_bella",
  echo: "am_echo",
  onyx: "am_onyx",
  fable: "bm_fable",
};

export function kokoroVoice(voice: string): string {
  if (/^[a-z][fm]_/.test(voice)) return voice;
  return KOKORO_VOICES[voice] ?? "af_heart";
}

/* Some open models wrap JSON in a ```json fence even in structured mode. */
function stripJsonFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s;
}

function buildMessages(opts: CompletionOptions): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (opts.system) out.push({ role: "system", content: opts.system });
  for (const m of opts.messages as ChatMessage[]) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/* User-initiated cancellation should surface as a native AbortError, not get
   reinterpreted as a network failure. A timeout is a network failure: the
   chain moves on to the next model. */
function toNetworkError(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  if (isTimeout(err)) return new EngineError("The AI provider took too long to answer.", "network");
  if (err instanceof Error && err.name === "AbortError") throw err;
  const message = err instanceof Error ? err.message : "Network request failed.";
  return new EngineError(message, "network");
}

function isTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || (err.cause instanceof Error && err.cause.name === "TimeoutError");
}

/* The caller's signal (if any) plus a timeout signal. */
function withSignal(caller: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

/* Aborts with a TimeoutError when reset() isn't called for `ms`. */
class IdleTimeout {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly signal = this.controller.signal;

  constructor(private readonly ms: number) {
    this.reset();
  }

  reset(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.controller.abort(new DOMException("The stream went quiet.", "TimeoutError")), this.ms);
  }

  stop(): void {
    clearTimeout(this.timer);
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
}

async function mapError(res: Response, provider: "openai" | "openrouter"): Promise<EngineError> {
  let message = res.statusText || `${providerLabel(provider)} request failed.`;
  let code: string | undefined;
  let type: string | undefined;
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error?.message) message = body.error.message;
    code = body?.error?.code;
    type = body?.error?.type;
  } catch {
    /* body wasn't JSON */
  }

  if (provider === "openrouter" && res.status === 402) {
    return new EngineError(
      `${message} — add credits at openrouter.ai/settings/credits, or switch to a free (:free) model.`,
      "quota",
    );
  }

  /* OpenAI returns HTTP 429 for both rate limits and quota exhaustion — check
     the error code first so quota errors aren't misreported as rate_limit. */
  if (code === "insufficient_quota" || type === "insufficient_quota") {
    return new EngineError(message, "quota");
  }
  /* Project-scoped keys can be missing access to specific models (e.g. TTS).
     Surface that as a clear, actionable message rather than a raw API error. */
  if (
    code === "model_not_found" ||
    /does not have access to model|model_not_found|must be verified to use the model/i.test(
      message,
    )
  ) {
    return new EngineError(
      provider !== "openai"
        ? message
        : `${message} — enable this model for your OpenAI project at platform.openai.com → Settings → Project → Limits.`,
      "model_missing",
    );
  }
  if (res.status === 401) return new EngineError(message, "auth");
  if (res.status === 429) return new EngineError(message, "rate_limit");
  if (res.status === 403) return new EngineError(message, "model_missing");
  return new EngineError(message, "unknown");
}
