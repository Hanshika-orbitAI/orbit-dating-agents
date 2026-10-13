import type { DateResult, RankEntry, Shortlist } from "./types";

// Mutual-fit ranking. A person's own agent's verdict weighs more than the counterpart's:
// you want someone who fits YOU, but a match only works if they'd say yes too.
// Pairs that never got a date fall back to the triage score, discounted.
export function rankFor(
  id: string,
  ids: string[],
  dates: DateResult[],
  shortlists: Record<string, Shortlist>
): RankEntry[] {
  const out: RankEntry[] = [];
  for (const other of ids) {
    if (other === id) continue;
    const d = dates.find((x) => (x.a === id && x.b === other) || (x.a === other && x.b === id));
    if (d) {
      const mine = d.a === id ? d.verdictA : d.verdictB;
      const theirs = d.a === id ? d.verdictB : d.verdictA;
      const score = Math.round(0.6 * mine.score + 0.4 * theirs.score - (mine.would_see_again ? 0 : 8) - (theirs.would_see_again ? 0 : 4));
      out.push({ id: other, score: Math.max(0, score), dated: true, mine: mine.score, theirs: theirs.score, reason: mine.reason, dateId: d.id });
    } else {
      const s = shortlists[id]?.find((x) => x.id === other);
      const t = shortlists[other]?.find((x) => x.id === id);
      const raw = s ? s.score : t ? t.score * 0.8 : 25;
      out.push({ id: other, score: Math.round(raw * 0.6), dated: false, reason: s?.why ?? "Not dated - triaged out." });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
