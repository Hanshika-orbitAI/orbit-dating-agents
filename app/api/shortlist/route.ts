import { ANALYZE_MODEL, askJSON } from "@/lib/llm";
import { SHORTLIST_SYSTEM, card, dossier } from "@/lib/prompts";
import type { Profile } from "@/lib/types";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { me, others, k } = (await req.json()) as { me: Profile; others: { id: string; profile: Profile }[]; k: number };
  try {
    const r = await askJSON<{ picks: { id: string; score: number; why: string }[] }>({
      model: ANALYZE_MODEL,
      system: SHORTLIST_SYSTEM,
      maxTokens: 1500,
      temperature: 0.3,
      messages: [{ role: "user", content: `PERSON:\n${dossier(me)}\n\nCANDIDATES:\n${others.map((o) => card(o.id, o.profile)).join("\n")}\n\nPick the top ${k} (plus one wildcard included in that count).` }],
    });
    const valid = new Set(others.map((o) => o.id));
    return Response.json({ picks: r.picks.filter((p) => valid.has(p.id)).slice(0, k) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
