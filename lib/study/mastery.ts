/* Quiz-mastery roll-up: pure aggregation over questions + attempts, no I/O. */

import type { QuizAttempt, QuizQuestion } from "@/lib/ai/types";

export interface TopicMastery {
  topic: string;
  correct: number;
  total: number;
  pct: number;
}

/**
 * Roll up quiz attempts by topic. The set of topics is the distinct set of
 * `topic` values present in `questions` — a topic with no attempts yet still
 * appears, with total 0 / correct 0 / pct 0. Results are sorted by topic
 * name.
 */
export function masteryByTopic(
  questions: QuizQuestion[],
  attempts: QuizAttempt[],
): TopicMastery[] {
  const topics = Array.from(new Set(questions.map((q) => q.topic)));

  const rows = topics.map((topic): TopicMastery => {
    const topicAttempts = attempts.filter((a) => a.topic === topic);
    const total = topicAttempts.length;
    const correct = topicAttempts.filter((a) => a.correct).length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    return { topic, correct, total, pct };
  });

  rows.sort((a, b) => a.topic.localeCompare(b.topic));
  return rows;
}

/** Design-token tone for a mastery percentage (ui-context.md: no red —
    weak = clay, developing = butter, strong = sage). */
export function masteryColor(pct: number): "clay" | "butter" | "sage" {
  if (pct < 50) return "clay";
  if (pct < 80) return "butter";
  return "sage";
}
