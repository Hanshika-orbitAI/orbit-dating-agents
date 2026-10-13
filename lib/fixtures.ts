// DEV-ONLY: LLM_MODE=fixture. Deterministic synthetic output so the UI/pipeline can be exercised without an
// Anthropic key. Everything it returns is stamped [FIXTURE]; the UI shows a banner. Never real agent activity.
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const isFixture = () => process.env.LLM_MODE === "fixture";

export function fixtureText(system: string, turn: number): string {
  return `[FIXTURE] turn ${turn}: synthetic line, no model was called.`;
}

export function fixtureJSON(system: string, user: string): any {
  if (system.startsWith("You are a perceptive")) {
    const slug = user.match(/linkedin\.com\/in\/([^/\s)]+)/)?.[1] ?? "unknown";
    const name = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: `${name} [FIXTURE]`, headline: "[FIXTURE] synthetic headline", location: "n/a", summary: "[FIXTURE] No model was called; this profile is synthetic.",
      needs: ["[FIXTURE] need A", "[FIXTURE] need B"], hobbies: ["[FIXTURE] hobby"], interests: ["[FIXTURE] interest"], values: ["[FIXTURE] value"], personality: ["[FIXTURE] trait"],
      communication_style: "[FIXTURE]", lifestyle: "[FIXTURE]", dealbreakers: ["[FIXTURE]"], looking_for: "[FIXTURE]", evidence: ["[FIXTURE] none"], confidence: "low" };
  }
  if (system.startsWith("You are a matchmaker")) {
    const ids = [...user.matchAll(/^\[(p\d+)\]/gm)].map((m) => m[1]);
    return { picks: ids.map((id) => ({ id, score: 40 + (hash(user.slice(0, 40) + id) % 55), why: "[FIXTURE] synthetic triage" })).sort((a, b) => b.score - a.score) };
  }
  const s = 30 + (hash(user) % 65);
  return { score: s, chemistry: "[FIXTURE] synthetic", needs_met: ["[FIXTURE]"], friction: ["[FIXTURE]"], would_see_again: s > 55, reason: "[FIXTURE] synthetic verdict, no model was called." };
}
