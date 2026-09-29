import type { AssistantEvent, TurnView } from "@/lib/chat/types";

/* POST a question to an assistant route and read its NDJSON answer (see
   answerStream in lib/ai/assistant.ts): the course assistant (feature 14)
   and the private space's chat (19). Resolves with the server-checked
   turn, which replaces the streamed text. Throws an Error whose message is
   fit to show; `onThread` has already said which thread saved the question
   by then, if the server got that far. */
export async function streamAnswer(
  url: string,
  body: Record<string, unknown>,
  on: { onThread?: (threadId: string) => void; onDelta?: (text: string) => void; onReset?: () => void },
): Promise<TurnView> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "The assistant couldn't answer just now. Try again in a moment.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as AssistantEvent;
      if (event.type === "thread") on.onThread?.(event.threadId);
      if (event.type === "delta") on.onDelta?.(event.text);
      if (event.type === "reset") on.onReset?.();
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") return event.turn;
    }
  }
  throw new Error("The answer was cut off. Try asking again.");
}
