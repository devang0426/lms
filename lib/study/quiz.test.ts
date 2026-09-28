import { describe, expect, it } from "vitest";
import { correctAnswerText, isCorrect, normalizeAnswer, parseNumber, sameAnswer } from "./quiz";

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
