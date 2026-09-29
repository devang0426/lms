import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIEngine, kokoroVoice } from "./openai";
import { AnthropicEngine } from "./anthropic";
import { LocalEngine } from "./local";
import { createEngine, OPENROUTER_BASE_URL, OPENROUTER_DEFAULT_CHAINS } from "./index";
import { EngineError } from "./types";

/* Builds a fake streaming Response whose body yields the given raw SSE/NDJSON
   chunks one at a time, mirroring how a real fetch ReadableStream arrives. */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* Typed wrapper around vi.fn() so `.mock.calls[n]` comes back as
   [url, init?] instead of an inferred empty tuple. */
function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(impl);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAIEngine", () => {
  it("complete() streams tokens and returns concatenated text", async () => {
    const chunks = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const fetchMock = mockFetch(async () => streamResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);

    const engine = new OpenAIEngine("sk-test");
    const tokens: string[] = [];
    const text = await engine.complete(
      { messages: [{ role: "user", content: "hi" }] },
      (t) => tokens.push(t),
    );

    expect(text).toBe("Hello world");
    expect(tokens).toEqual(["Hello", " world"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.stream).toBe(true);
  });

  it("complete() uses the strong-tier model and a constructor override", async () => {
    const fetchMock = mockFetch(async () => streamResponse(["data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const strong = new OpenAIEngine("sk-test");
    await strong.complete({ messages: [{ role: "user", content: "hi" }], tier: "strong" });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).model).toBe("gpt-4o");

    const overridden = new OpenAIEngine("sk-test", "gpt-4o-2024-08-06");
    await overridden.complete({ messages: [{ role: "user", content: "hi" }], tier: "fast" });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).model).toBe("gpt-4o-2024-08-06");
  });

  it("structured() parses the JSON content returned by the model", async () => {
    const payload = { name: "Ada", age: 30 };
    const fetchMock = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = new OpenAIEngine("sk-test");
    const result = await engine.structured<typeof payload>({
      messages: [{ role: "user", content: "extract the person" }],
      schema: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } } },
      schemaName: "person",
    });

    expect(result).toEqual(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "person", schema: expect.any(Object), strict: true },
    });
  });

  it("maps a 401 response to an auth EngineError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => jsonResponse({ error: { message: "Incorrect API key" } }, 401)),
    );
    const engine = new OpenAIEngine("sk-bad");
    await expect(engine.validate()).rejects.toMatchObject({ name: "EngineError", kind: "auth" });
  });

  it("maps insufficient_quota to a quota EngineError even on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () =>
        jsonResponse({ error: { message: "You exceeded your quota", code: "insufficient_quota" } }, 429),
      ),
    );
    const engine = new OpenAIEngine("sk-test");
    await expect(
      engine.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ name: "EngineError", kind: "quota" });
  });

  it("wraps a network failure as a network EngineError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const engine = new OpenAIEngine("sk-test");
    await expect(
      engine.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ name: "EngineError", kind: "network" });
  });
});

describe("AnthropicEngine", () => {
  it("complete() parses the Anthropic content_block_delta SSE stream", async () => {
    const chunks = [
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hi" },
      })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: " there" },
      })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ];
    const fetchMock = mockFetch(async () => streamResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);

    const engine = new AnthropicEngine("sk-ant-test");
    const text = await engine.complete({
      system: "Be terse.",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(text).toBe("Hi there");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.system[0].text).toBe("Be terse.");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("structured() sends a forced tool_choice and parses tool_use input", async () => {
    const payload = { title: "Photosynthesis", topic: "biology" };
    const fetchMock = mockFetch(async () =>
      jsonResponse({ content: [{ type: "tool_use", name: "note", input: payload }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = new AnthropicEngine("sk-ant-test");
    const result = await engine.structured<typeof payload>({
      messages: [{ role: "user", content: "extract" }],
      schema: { type: "object" },
      schemaName: "note",
    });

    expect(result).toEqual(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: "note" });
    expect(body.tools[0].name).toBe("note");
  });

  it("transcribe() throws an EngineError with kind unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => {
        throw new Error("should not be called");
      }),
    );
    const engine = new AnthropicEngine("sk-ant-test");
    await expect(engine.transcribe(new Blob(["audio"]))).rejects.toMatchObject({
      name: "EngineError",
      kind: "unsupported",
    });
  });

  it("tts() and embed() also throw kind unsupported", async () => {
    const engine = new AnthropicEngine("sk-ant-test");
    await expect(engine.tts("hello", { voice: "alloy" })).rejects.toBeInstanceOf(EngineError);
    await expect(engine.embed(["hello"])).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("capabilities() reports no transcription/tts/embeddings", () => {
    const engine = new AnthropicEngine("sk-ant-test");
    expect(engine.capabilities()).toEqual({
      chat: true,
      transcription: false,
      tts: false,
      embeddings: false,
    });
  });

  it("validate() maps a 401 to an auth EngineError", async () => {
    vi.stubGlobal("fetch", mockFetch(async () => jsonResponse({ error: { message: "bad key" } }, 401)));
    const engine = new AnthropicEngine("sk-ant-bad");
    await expect(engine.validate()).rejects.toMatchObject({ name: "EngineError", kind: "auth" });
  });
});

describe("LocalEngine", () => {
  it("complete() parses newline-delimited JSON chunks from Ollama", async () => {
    const chunks = [
      `${JSON.stringify({ message: { content: "Hel" }, done: false })}\n`,
      `${JSON.stringify({ message: { content: "lo" }, done: false })}\n`,
      `${JSON.stringify({ message: { content: "" }, done: true })}\n`,
    ];
    const fetchMock = mockFetch(async () => streamResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);

    const engine = new LocalEngine();
    const tokens: string[] = [];
    const text = await engine.complete(
      { messages: [{ role: "user", content: "hi" }] },
      (t) => tokens.push(t),
    );

    expect(text).toBe("Hello");
    expect(tokens).toEqual(["Hel", "lo"]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
  });

  it("transcribe() and tts() throw model_missing", async () => {
    const engine = new LocalEngine();
    await expect(engine.transcribe(new Blob(["audio"]))).rejects.toMatchObject({
      name: "EngineError",
      kind: "model_missing",
    });
    await expect(engine.tts("hi", { voice: "default" })).rejects.toMatchObject({
      kind: "model_missing",
    });
  });

  it("validate() throws model_missing when Ollama is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const engine = new LocalEngine("http://localhost:11434");
    await expect(engine.validate()).rejects.toMatchObject({
      name: "EngineError",
      kind: "model_missing",
    });
  });
});

describe("createEngine", () => {
  it("returns the right class per mode/provider", () => {
    expect(createEngine({ mode: "cloud", provider: "openai", apiKey: "sk-x" })).toBeInstanceOf(
      OpenAIEngine,
    );
    expect(
      createEngine({ mode: "cloud", provider: "anthropic", apiKey: "sk-ant-x" }),
    ).toBeInstanceOf(AnthropicEngine);
    expect(createEngine({ mode: "local" })).toBeInstanceOf(LocalEngine);
  });

  it("throws when cloud mode is missing an API key or provider", () => {
    expect(() => createEngine({ mode: "cloud" })).toThrow(EngineError);
    expect(() => createEngine({ mode: "cloud", apiKey: "sk-x" })).toThrow(EngineError);
  });
});

describe("OpenRouter engine", () => {
  const sse = (text: string) => [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const modelOf = (init?: RequestInit) => JSON.parse(init?.body as string).model as string;

  it("routes sk-or- keys to openrouter.ai with the first model in the tier", async () => {
    const fetchMock = mockFetch(async () => streamResponse(sse("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
    await engine.complete({ messages: [{ role: "user", content: "hi" }], tier: "strong" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(modelOf(init)).toBe(OPENROUTER_DEFAULT_CHAINS.strong[0]);
    expect(engine.capabilities().tts).toBe(true);
  });

  it("falls back to the next model on a 5xx or 429, keeping the stream from the one that worked", async () => {
    // Read from the chain, so the test holds whatever the model order is.
    const [first, second, third] = OPENROUTER_DEFAULT_CHAINS.fast;
    const fetchMock = mockFetch(async (_url, init) => {
      const model = modelOf(init);
      if (model === first) return jsonResponse({ error: { message: "down" } }, 503);
      if (model === second) return jsonResponse({ error: { message: "slow down" } }, 429);
      return streamResponse(sse("from the third"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
    const text = await engine.complete({ messages: [{ role: "user", content: "hi" }], tier: "fast" });

    expect(text).toBe("from the third");
    expect(fetchMock.mock.calls.map(([, init]) => modelOf(init))).toEqual([first, second, third]);
  });

  it("structured() moves on when a model returns broken JSON, and accepts fenced JSON", async () => {
    const fetchMock = mockFetch(async (_url, init) =>
      jsonResponse({
        choices: [
          {
            message: {
              content: modelOf(init) === OPENROUTER_DEFAULT_CHAINS.strong[0] ? "not json" : '```json\n{"ok":true}\n```',
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
    const out = await engine.structured<{ ok: boolean }>({
      messages: [{ role: "user", content: "hi" }],
      tier: "strong",
      schema: {},
      schemaName: "t",
    });

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe("timeouts (a stuck provider must not stall a pipeline)", () => {
    // Never answers until the request's signal aborts, like a stalled upstream.
    const hang = (init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    // Sends headers, then goes quiet until aborted.
    const quietStream = (init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(c) {
            init?.signal?.addEventListener("abort", () => c.error(init.signal!.reason));
          },
        }),
        { status: 200 },
      );
    const engineWithTimeouts = () =>
      new OpenAIEngine("sk-or-v1-x", undefined, {
        provider: "openrouter",
        baseUrl: OPENROUTER_BASE_URL,
        chains: OPENROUTER_DEFAULT_CHAINS,
        requestTimeoutMs: 30,
        streamIdleMs: 30,
      });

    it("structured() gives up on a model that doesn't answer and tries the next", async () => {
      const fetchMock = mockFetch(async (_url, init) =>
        modelOf(init) === OPENROUTER_DEFAULT_CHAINS.fast[0]
          ? hang(init)
          : jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await engineWithTimeouts().structured<{ ok: boolean }>({
        messages: [{ role: "user", content: "hi" }],
        tier: "fast",
        schema: {},
        schemaName: "t",
      });
      expect(out).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("complete() gives up on a stream that goes quiet before answering", async () => {
      const fetchMock = mockFetch(async (_url, init) =>
        modelOf(init) === OPENROUTER_DEFAULT_CHAINS.fast[0] ? hang(init) : streamResponse(sse("from muse")),
      );
      vi.stubGlobal("fetch", fetchMock);
      expect(await engineWithTimeouts().complete({ messages: [{ role: "user", content: "hi" }], tier: "fast" })).toBe("from muse");
    });

    it("complete() reports a stream that stalls mid-answer as a network error", async () => {
      vi.stubGlobal("fetch", mockFetch(async (_url, init) => quietStream(init)));
      await expect(
        engineWithTimeouts().complete({ messages: [{ role: "user", content: "hi" }], tier: "fast" }),
      ).rejects.toMatchObject({ kind: "network", message: "The AI provider took too long to answer." });
    });
  });

  it("stops the chain on a bad key or no credit instead of trying every model", async () => {
    for (const [status, kind] of [[401, "auth"], [402, "quota"]] as const) {
      const fetchMock = mockFetch(async () => jsonResponse({ error: { message: "nope" } }, status));
      vi.stubGlobal("fetch", fetchMock);
      const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
      await expect(engine.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ kind });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("tts() uses Kokoro with the OpenAI voice name mapped to its Kokoro twin", async () => {
    const fetchMock = mockFetch(async () => new Response(new Blob(["mp3"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
    await engine.tts("Hello", { voice: "nova", format: "mp3" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(JSON.parse(init?.body as string)).toMatchObject({ model: "hexgrad/kokoro-82m", voice: "af_nova", input: "Hello" });
    expect(kokoroVoice("am_michael")).toBe("am_michael");
    expect(kokoroVoice("unknown")).toBe("af_heart");
  });

  it("validate() checks the key against /key, since /models is public", async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ error: { message: "bad" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x" });
    await expect(engine.validate()).rejects.toThrow("Invalid OpenRouter API key.");
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
  });
});

describe("usage reporting (ai_usage)", () => {
  const usage = { prompt_tokens: 18, completion_tokens: 20, cost: 0.00001044 };

  it("complete() asks OpenRouter for usage and reports the final SSE chunk's cost", async () => {
    const chunks = [
      `data: ${JSON.stringify({ model: "vendor/served", choices: [{ delta: { content: "OK" } }] })}\n\n`,
      `data: ${JSON.stringify({ model: "vendor/served", choices: [], usage })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const fetchMock = mockFetch(async () => streamResponse(chunks));
    vi.stubGlobal("fetch", fetchMock);
    const onUsage = vi.fn();
    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x", onUsage });
    await engine.complete({ messages: [{ role: "user", content: "hi" }] });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      usage: { include: true },
      stream_options: { include_usage: true },
    });
    expect(onUsage).toHaveBeenCalledWith({
      task: "chat",
      model: "vendor/served",
      inputTokens: 18,
      outputTokens: 20,
      costUsd: 0.00001044,
      estimated: false,
    });
  });

  it("structured() reports once per successful call, even if a first model failed", async () => {
    let call = 0;
    const fetchMock = mockFetch(async () =>
      call++ === 0
        ? jsonResponse({ error: { message: "down" } }, 503)
        : jsonResponse({ choices: [{ message: { content: '{"a":1}' } }], usage }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onUsage = vi.fn();
    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x", onUsage });
    await engine.structured({ messages: [{ role: "user", content: "x" }], schema: {}, schemaName: "s" });

    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls[0][0]).toMatchObject({ task: "structured", costUsd: 0.00001044, estimated: false });
  });

  it("tts() has no reported cost, so it's estimated from characters", async () => {
    vi.stubGlobal("fetch", mockFetch(async () => new Response(new Blob(["mp3"]), { status: 200 })));
    const onUsage = vi.fn();
    const engine = createEngine({ mode: "cloud", provider: "openrouter", apiKey: "sk-or-v1-x", onUsage });
    await engine.tts("x".repeat(1_000_000), { voice: "nova" });

    expect(onUsage.mock.calls[0][0]).toMatchObject({ task: "tts", model: "hexgrad/kokoro-82m", estimated: true });
    expect(onUsage.mock.calls[0][0].costUsd).toBeCloseTo(0.62);
  });

  it("a throwing usage hook never breaks the call", async () => {
    vi.stubGlobal("fetch", mockFetch(async () => jsonResponse({ data: [{ embedding: [1, 2] }], usage })));
    const engine = createEngine({
      mode: "cloud",
      provider: "openrouter",
      apiKey: "sk-or-v1-x",
      onUsage: () => {
        throw new Error("db down");
      },
    });
    await expect(engine.embed(["hi"])).resolves.toEqual([[1, 2]]);
  });
});
