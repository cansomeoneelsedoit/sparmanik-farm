import { describe, expect, it } from "vitest";

import { markAnswers, markQuestion, orderShuffleMap, sanitizeQuestion } from "./training";

const mc = (id: string, correct: number[]) => ({
  id,
  type: "MULTIPLE_CHOICE" as const,
  config: { options: [{ en: "a", id: "a" }, { en: "b", id: "b" }, { en: "c", id: "c" }], correct },
});
const fill = (id: string, accept: string[]) => ({
  id,
  type: "FILL_BLANK" as const,
  config: { accept },
});
const order = (id: string, n: number) => ({
  id,
  type: "ORDER" as const,
  config: { items: Array.from({ length: n }, (_, i) => ({ en: `s${i}`, id: `s${i}` })) },
});

describe("markQuestion", () => {
  it("multiple choice: exact set match, any order", () => {
    expect(markQuestion(mc("q", [0, 2]), [2, 0])).toBe(true);
    expect(markQuestion(mc("q", [0, 2]), [0])).toBe(false);
    expect(markQuestion(mc("q", [0, 2]), [0, 1, 2])).toBe(false);
    expect(markQuestion(mc("q", [1]), [1])).toBe(true);
  });

  it("fill blank: case/space/punctuation-insensitive against accepted list", () => {
    const q = fill("q", ["Kalium Nitrat", "KNO3"]);
    expect(markQuestion(q, "kalium  nitrat")).toBe(true);
    expect(markQuestion(q, "  KNO3. ")).toBe(true);
    expect(markQuestion(q, "kalium")).toBe(false);
    expect(markQuestion(q, "")).toBe(false);
  });

  it("order: correct iff the submitted DISPLAY positions rebuild the original order", () => {
    const q = order("q", 4);
    const map = orderShuffleMap(q.id, 4); // map[displayedPos] = original idx
    // The right answer: for each original index i, the displayed position
    // holding it (the inverse permutation).
    const right = [0, 1, 2, 3].map((i) => map.indexOf(i));
    expect(markQuestion(q, right)).toBe(true);
    // Tapping the tiles left-to-right as displayed (0,1,2,3) must NOT pass —
    // the shuffle guarantees display order ≠ answer order.
    expect(markQuestion(q, [0, 1, 2, 3])).toBe(false);
    expect(markQuestion(q, right.slice(0, 3))).toBe(false); // wrong length
    expect(markQuestion(q, [right[0], right[0], right[2], right[3]])).toBe(false); // not a permutation
    expect(markQuestion(q, [0, 1, 2, 99])).toBe(false); // out of range
  });

  it("photo spot marks like multiple choice", () => {
    const q = { id: "q", type: "PHOTO_SPOT" as const, config: { options: [], correct: [1] } };
    expect(markQuestion(q, [1])).toBe(true);
    expect(markQuestion(q, [0])).toBe(false);
  });

  it("malformed config or answer marks wrong, never throws", () => {
    expect(markQuestion({ id: "q", type: "MULTIPLE_CHOICE", config: null }, [0])).toBe(false);
    expect(markQuestion(mc("q", [0]), "not-an-array")).toBe(false);
    expect(markQuestion(fill("q", ["x"]), 42)).toBe(false);
  });
});

describe("markAnswers", () => {
  it("scores and passes against passPct", () => {
    const qs = [mc("a", [0]), mc("b", [1]), fill("c", ["ok"]), order("d", 2)];
    // For "d", submit the DISPLAY order as-is (0,1) — the never-identity
    // shuffle guarantees that's wrong, so 3 of 4 correct.
    const r = markAnswers(qs, { a: [0], b: [1], c: "ok", d: [0, 1] }, 75);
    expect(r.score).toBe(75);
    expect(r.passed).toBe(true);
    expect(r.perQuestion).toEqual({ a: true, b: true, c: true, d: false });
  });

  it("empty lesson never passes; missing answers mark wrong", () => {
    expect(markAnswers([], {}, 80).passed).toBe(false);
    const r = markAnswers([mc("a", [0])], {}, 80);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe("sanitizeQuestion", () => {
  it("strips correct answers from choice questions", () => {
    const s = sanitizeQuestion(mc("q", [0, 2]));
    expect(JSON.stringify(s.config)).not.toContain("correct");
    expect((s.config as { options: unknown[] }).options).toHaveLength(3);
  });

  it("strips accepted answers from fill blanks", () => {
    const s = sanitizeQuestion(fill("q", ["secret"]));
    expect(JSON.stringify(s.config)).not.toContain("secret");
  });

  it("order: shuffled deterministically, never in answer order, no order info leaks", () => {
    const q = order("stable-id", 5);
    const s1 = sanitizeQuestion(q);
    const s2 = sanitizeQuestion(q);
    expect(s1).toEqual(s2); // reload-stable
    // Nothing beyond the shuffled labels goes to the client.
    expect(Object.keys(s1)).toEqual(["config"]);
    const shuffled = (s1.config as { items: { en: string }[] }).items;
    const map = orderShuffleMap(q.id, 5);
    shuffled.forEach((item, pos) => expect(item.en).toBe(`s${map[pos]}`));
    // Never the identity: the display order must not equal the answer order.
    expect(map.some((v, i) => v !== i)).toBe(true);
    // End-to-end: a user who rebuilds the true order (inverse permutation of
    // displayed positions) passes; left-to-right as displayed fails.
    const right = [0, 1, 2, 3, 4].map((i) => map.indexOf(i));
    expect(markQuestion(q, right)).toBe(true);
    expect(markQuestion(q, [0, 1, 2, 3, 4])).toBe(false);
  });

  it("order: never-identity holds across many question ids", () => {
    for (let k = 0; k < 200; k++) {
      const map = orderShuffleMap(`q-${k}`, 3 + (k % 5));
      expect(map.some((v, i) => v !== i)).toBe(true);
      // Still a valid permutation.
      expect([...map].sort((a, b) => a - b)).toEqual(Array.from({ length: map.length }, (_, i) => i));
    }
  });
});
