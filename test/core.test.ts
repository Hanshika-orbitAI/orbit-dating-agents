import { test } from "node:test";
import assert from "node:assert/strict";
import { rankFor } from "../lib/rank.ts";
import { parseLines } from "../lib/parse.ts";
import { extractJSON } from "../lib/json.ts";

const v = (score: number, again = true) => ({ score, chemistry: "", needs_met: [], friction: [], would_see_again: again, reason: "r" });

test("parseLines pairs urls in any order and flags missing ones", () => {
  const r = parseLines("https://instagram.com/a_b, https://www.linkedin.com/in/ab/\nhttps://www.linkedin.com/in/solo/");
  assert.equal(r[0].linkedin, "https://www.linkedin.com/in/ab/");
  assert.equal(r[0].instagram, "https://instagram.com/a_b");
  assert.equal(r[1].instagram, "");
});

test("rankFor weights own agent 60/40, penalises no-second-date, falls back for undated", () => {
  const dates = [
    { id: "p1-p2", a: "p1", b: "p2", turns: [], verdictA: v(90), verdictB: v(50) },
    { id: "p1-p3", a: "p3", b: "p1", turns: [], verdictA: v(100), verdictB: v(80, false) },
  ];
  const r = rankFor("p1", ["p1", "p2", "p3", "p4"], dates, { p1: [{ id: "p4", score: 80, why: "w" }] });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(by.p2.score, Math.round(0.6 * 90 + 0.4 * 50)); // 74
  assert.equal(by.p3.score, Math.round(0.6 * 80 + 0.4 * 100 - 8)); // 80
  assert.equal(by.p4.dated, false);
  assert.equal(by.p4.score, 48);
  assert.equal(r[0].id, "p3");
});

test("extractJSON tolerates prose around the object", () => {
  assert.deepEqual(extractJSON('Sure!\n{"a":1}\nthanks'), { a: 1 });
  assert.throws(() => extractJSON("no json"));
});
