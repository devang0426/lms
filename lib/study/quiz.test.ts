import { describe, expect, it } from "vitest";
import {
  answersRevealed,
  correctAnswerText,
  GRADED_GRACE_MS,
  gradedFeedback,
  isCorrect,
  normalizeAnswer,
  parseNumber,
  sameAnswer,
  submitDeadline,
  submitOpen,
} from "./quiz";

describe("isCorrect", () => {
  const mcq = { type: "mcq" as const, options: ["a", "b", "c", "d"], correctIndex: 2 };
  const tf = { type: "true_false" as const, options: ["True", "False"], correctIndex: 1 };
  const blank = { type: "fill_blank" as const, options: ["span"], correctIndex: 0 };

  it("checks choice questions by index", () => {
    expect(isCorrect(mcq, "2")).toBe(true);
    expect(isCorrect(mcq, " 2 ")).toBe(true);
    expect(isCorrect(mcq, "1")).toBe(false);
    expect(isCorrect(mcq, "c")).toBe(false);
    expect(isCorrect(mcq, "")).toBe(false);
    expect(isCorrect(tf, "1")).toBe(true);
  });

  it("checks fill-in-the-blank against options[0]", () => {
    expect(isCorrect(blank, "  The SPAN. ")).toBe(true);
    expect(isCorrect(blank, "spam")).toBe(false);
    expect(correctAnswerText(blank)).toBe("span");
    expect(correctAnswerText(mcq)).toBe("c");
  });
});

describe("fill-in-the-blank comparison", () => {
  it("ignores case, spacing, end punctuation, articles and $…$", () => {
    expect(sameAnswer("Linear   Combination", "a linear combination")).toBe(true);
    expect(sameAnswer("$x^2$", "x^2")).toBe(true);
    expect(sameAnswer("“span”", "span")).toBe(true);
    expect(normalizeAnswer("  An Arrow! ")).toBe("arrow");
  });

  it("treats simple number formats as equal", () => {
    expect(sameAnswer("0.50", ".5")).toBe(true);
    expect(sameAnswer("1/2", "0.5")).toBe(true);
    expect(sameAnswer("1,000", "1000")).toBe(true);
    expect(sameAnswer("+3", "3.0")).toBe(true);
    expect(sameAnswer("−2", "-2")).toBe(true);
    expect(sameAnswer("2", "3")).toBe(false);
  });

  it("never accepts an empty answer", () => {
    expect(sameAnswer("", "")).toBe(false);
    expect(sameAnswer("   ", "span")).toBe(false);
    expect(sameAnswer("the", "span")).toBe(false);
  });

  it("parses only plain numbers and fractions", () => {
    expect(parseNumber("12.25")).toBe(12.25);
    expect(parseNumber("3/4")).toBe(0.75);
    expect(parseNumber("1/0")).toBeNull();
    expect(parseNumber("1,00")).toBeNull();
    expect(parseNumber("two")).toBeNull();
    expect(parseNumber(".")).toBeNull();
  });
});

describe("graded quizzes: deadline and reveal (feature 24)", () => {
  const due = Date.UTC(2026, 9, 5, 17, 0);
  const min = 60_000;

  it("takes submits until the due date plus 10 minutes, then refuses", () => {
    expect(GRADED_GRACE_MS).toBe(10 * min);
    expect(submitDeadline(due)).toBe(due + 10 * min);
    expect(submitOpen(due, due - 3 * 24 * 60 * min)).toBe(true);
    expect(submitOpen(due, due + 9 * min)).toBe(true);
    expect(submitOpen(due, due + 10 * min)).toBe(false);
    // An attempt started early can't be handed in days later.
    expect(submitOpen(due, due + 2 * 24 * 60 * min)).toBe(false);
  });

  it("reveals answers exactly when submitting closes, never while it's open", () => {
    for (const t of [due - min, due, due + 9 * min, due + 10 * min, due + 60 * min]) {
      expect(answersRevealed(due, t)).toBe(!submitOpen(due, t));
    }
    expect(answersRevealed(due, due)).toBe(false);
    expect(answersRevealed(due, due + 10 * min)).toBe(true);
  });

  const q = (id: string, correctIndex: number) => ({
    id,
    type: "mcq" as const,
    options: ["a", "b", "c"],
    correctIndex,
    explanation: `why ${id}`,
    startSec: 30,
  });
  const scored = [
    { q: q("q2", 1), answer: "0", correct: false },
    { q: q("q1", 2), answer: "2", correct: true },
  ];

  it("before the reveal: score and right/wrong only, in the quiz's order", () => {
    const hidden = gradedFeedback(scored, ["q1", "q2"], false);
    expect(hidden.map((f) => [f.questionId, f.correct])).toEqual([
      ["q1", true],
      ["q2", false],
    ]);
    for (const f of hidden) {
      expect(f.correctAnswer).toBeNull();
      expect(f.explanation).toBeNull();
    }
    // The student's own answer and the video moment are theirs to see.
    expect(hidden[1]).toMatchObject({ answer: "0", startSec: 30 });
  });

  it("after the reveal: the correct answers and explanations too", () => {
    const shown = gradedFeedback(scored, ["q1", "q2"], true);
    expect(shown[1]).toMatchObject({ questionId: "q2", correct: false, correctAnswer: "b", explanation: "why q2" });
  });
});
