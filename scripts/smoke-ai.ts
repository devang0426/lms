/* Live smoke test of the ported AI engine (feature 05). Costs a fraction of
   a cent. Run: npm run smoke:ai */

import { getEngine } from "@/lib/ai/engine/server";

async function main() {
  const engine = getEngine();
  const started = Date.now();
  let streamed = 0;
  const text = await engine.complete(
    {
      system: "You are a terse assistant.",
      messages: [{ role: "user", content: "Reply with exactly: Studyhall engine OK" }],
      tier: "fast",
      maxTokens: 600, // fast-tier models may reason first; tiny budgets return nothing
      temperature: 0,
    },
    (delta) => {
      streamed += delta.length;
    },
  );
  console.log(`complete(): "${text.trim()}" · ${streamed} chars streamed · ${Date.now() - started} ms`);

  const { answer } = await engine.structured<{ answer: number }>({
    messages: [{ role: "user", content: "What is 6 times 7? Answer as JSON." }],
    schema: {
      type: "object",
      properties: { answer: { type: "number" } },
      required: ["answer"],
      additionalProperties: false,
    },
    schemaName: "arith",
    tier: "fast",
  });
  console.log(`structured(): answer = ${answer}`);
}

main().catch((err) => {
  console.error("Smoke test failed:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
