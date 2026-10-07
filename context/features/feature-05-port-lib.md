# Feature 05: Port `lib/`

**Status:** Done (2026-09-25)
**Depends on:** 02
**Demo step:** — (enables features 09–19)

## Goal

The core `lib/` code compiles in this Next.js app and runs on the server, with
its tests passing. There is no new behavior yet.

## Scope

**In:**
- Move the code.
- Install its dependencies.
- Delete the desktop-only modules.
- Make it server-only.
- Get the tests passing.

**Out:**
- The job pipeline (09 and 10).
- New prompts (12 and 14).
- The database rewrite (each feature adds its own tables).

## Steps

1. **Move** the code to its new home:
   - `lib/engine`, `lib/generation`, `lib/prompts`, `lib/ingest` and
     `lib/audio` move to `lib/ai/…`.
   - `lib/study` and `lib/markdown.ts` stay where they are.
2. **Delete:**
   - `lib/app.tsx`, `lib/prefs.ts`, `lib/theme.ts`
   - `lib/engine/keys.ts` (and its test)
   - `lib/publik.ts`, `lib/publikCopy.ts` (and their tests)
   - `lib/localSetup.ts` (and its test), `lib/copy.test.ts` if it tests
     removed copy
   - `lib/db/idb.ts`
   - Keep `lib/db/memory.ts` as `lib/ai/testing/memory-store.ts` if the
     generation tests use it.
3. **Engine:**
   - Remove the `publik` provider paths and the `pk_` handling.
   - Add `lib/ai/engine/server.ts` with `getEngine()`. It builds
     `resilient(createEngine({ mode: "cloud", provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY }))`
     and is `server-only`.
4. **Install:** `katex`, `marked`, `dompurify` (with `isomorphic-dompurify`
   for server rendering), `uuid`, `mammoth`, `unpdf` (a Node-friendly PDF
   extractor that replaces the Vite `?url` pdfjs worker), `zod`, and
   `vitest` as a dev dependency.
5. **`ingest/pdf.ts`:**
   - Rewrite it on `unpdf`.
   - Return per-page text so later citations can show `page`.
6. **`ingest/youtube.ts` and `ytdlp.mjs`:**
   - Move them to `lib/ai/ingest/youtube/`.
   - Change `vttToText` to also return timed cues `{start, end, text}`.
   - Keep the flattened text too.
7. **`study/mastery.ts`:** `masteryColor` returns
   `"sage" | "butter" | "clay"`.
8. **Tests:**
   - Add a `vitest.config.ts` and an `npm test` script.
   - Every remaining test must pass.
   - Tests must not call real providers.
9. **`tsconfig`:**
   - Remove the unported library entries from `exclude` in `tsconfig.json`.
     Features 01 and 02 added them so the build could pass.
   - `lib/db/index.ts`, `idb.ts` and `memory.ts` are legacy store files, and
     they sit next to the new `lib/db/client.ts` and `schema.ts`. Move or
     delete them per step 2.
   - `tsc --noEmit` is clean.

## Acceptance criteria

- [x] `npx tsc --noEmit` reports 0 errors, down from 33. `tsconfig`
      excludes only `node_modules` again.
- [x] `npm test` passes: 121 tests in 11 files, 2 of them new for VTT
      cues.
- [x] No file under `lib/ai` can be imported from a client component.
      Verified: a temporary client page that imported
      `lib/ai/engine/server` failed the build with `server-only` errors.
- [x] `npm run smoke:ai` against the real OpenRouter key: streaming
      `complete()` returns "Studyhall engine OK", and `structured()`
      returns `{answer: 42}`.
- [x] `npm run build` passes, and `eslint .` has 0 errors and 0 warnings.

## As built

- **Layout:**
  - `lib/ai/{engine,generation,prompts,ingest,audio}`: the AI code.
  - `lib/ai/types.ts`: the domain types.
  - `lib/utils/ids.ts`.
  - `lib/study/` and `lib/markdown.ts` stay where they were.
  - `lib/export.ts` stays too.
  - YouTube is now `lib/ai/ingest/youtube/{index.ts,ytdlp.mjs}`.
- **Deleted:** `app.tsx`, `prefs.ts`, `theme.ts`, `publik*.ts`,
  `localSetup.ts`, `engine/keys.ts`, `db/idb.ts`, plus their tests and
  `copy.test.ts`, which tested legacy copy.
- **`lib/ai/legacy/` holds the old browser pipeline:** `pipeline.ts` and its
  key-value store `repo.ts` and `memory-store.ts`, with their tests. It is
  kept only as a tested reference for features 09 and 10, which replace it
  with Trigger.dev tasks and then delete the folder. **Don't import it from
  app code.**
- **Engine:**
  - publik is removed everywhere: the provider, the usage headers, the
    `credit` error kind, and 220 lines of tests.
  - `lib/ai/engine/server.ts` → `getEngine()`: OpenRouter with
    `OPENROUTER_API_KEY`, wrapped in `resilient()`, cached, server-only.
  - OpenRouter attribution is now `X-Title: Studyhall`.
  - A `// TODO(feature 09)` in `openai.ts` marks where usage and cost
    should be read for `ai_usage`.
- **`server-only`** is imported by every runtime module in `lib/ai`.
  Vitest maps it to `test/server-only-stub.ts`.
- **PDF:** now uses `unpdf`, a Node build of pdf.js. `IngestResult` has a
  new `pages: string[]` field for page citations.
- **Markdown:**
  - `isomorphic-dompurify` replaces `dompurify`, so `renderInline`,
    `renderMarkdown` and `renderRichInline` **sanitize on the server**
    instead of escaping everything.
  - The old node-escape test was rewritten to assert sanitizing: no
    `<script>` and no `onerror`.
- **YouTube:**
  - The Tauri and Vite-plugin paths are removed. The timed-text captions
    attempt stays, as best effort.
  - `ytdlp.mjs` gained `vttToCues()`, which returns `{start,end,text}` in
    seconds and merges repeats. `extractYoutube()` now returns `cues` too.
- **`masteryColor`** returns `clay | butter | sage`.
- **Tooling:**
  - `vitest.config.mts` with the `@` alias and `npm test`.
  - `npm run smoke:ai`.
  - `@types/node` moved to `^22`, to match the Node 22 runtime and the
    vitest 5 peer dependency.
  - ESLint ignores names prefixed with `_`.

## Known issues handed to later features

- **Feature 10:** OpenRouter `transcribe()` still chunks audio with WebAudio,
  which doesn't exist on the server. Pre-chunk with ffmpeg in the task (or
  inject `audioDecoder`) before calling it.
- **Feature 12:** the fast-tier chain starts with a *reasoning* model
  (`nemotron-3-super`). With tiny `maxTokens` it spends the budget
  thinking and returns empty text. `generateTitle` uses `maxTokens: 30`,
  so raise it (about 300) or ask OpenRouter to exclude reasoning. The smoke
  test uses 600.
