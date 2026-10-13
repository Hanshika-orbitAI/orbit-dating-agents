import { DATE_MODEL, ask, askJSON } from "@/lib/llm";
import { VERDICT_SYSTEM, agentSystem, transcript, verdictUser } from "@/lib/prompts";
import type { Profile, Turn, Verdict } from "@/lib/types";
export const maxDuration = 60;

// One date = two real agents taking alternating turns, each grounded only in its own principal's dossier,
// followed by two independent private debriefs. Agent A always opens.
export async function POST(req: Request) {
  const { a, b, rounds = 3 } = (await req.json()) as { a: Profile; b: Profile; rounds?: number };
  try {
    const turns: Turn[] = [];
    for (let i = 0; i < rounds * 2; i++) {
      const speaker = i % 2 === 0 ? "a" : "b";
      const me = speaker === "a" ? a : b;
      const other = speaker === "a" ? b : a;
      const history = turns.map((t) => ({ role: (t.speaker === speaker ? "assistant" : "user") as "assistant" | "user", content: t.text }));
      const starter = { role: "user" as const, content: `(The date begins. ${i === 0 ? `You greet ${other.name} first.` : `${other.name} is across the table.`})` };
      const messages = history[0]?.role === "user" ? history : [starter, ...history];
      const text = await ask({ model: DATE_MODEL, system: agentSystem(me, other, rounds * 2 - i), messages, maxTokens: 220, temperature: 0.9 });
      turns.push({ speaker, text });
    }
    const tx = transcript(a, b, turns);
    const [verdictA, verdictB] = await Promise.all([
      askJSON<Verdict>({ model: DATE_MODEL, system: VERDICT_SYSTEM, maxTokens: 500, temperature: 0.2, messages: [{ role: "user", content: verdictUser(a, b, tx) }] }),
      askJSON<Verdict>({ model: DATE_MODEL, system: VERDICT_SYSTEM, maxTokens: 500, temperature: 0.2, messages: [{ role: "user", content: verdictUser(b, a, tx) }] }),
    ]);
    return Response.json({ turns, verdictA, verdictB });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
