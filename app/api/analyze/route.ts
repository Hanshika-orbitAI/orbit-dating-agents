import { ANALYZE_MODEL, askJSON } from "@/lib/llm";
import { ANALYZE_SYSTEM } from "@/lib/prompts";
import type { Profile, Scraped } from "@/lib/types";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { scraped, linkedin, instagram } = (await req.json()) as { scraped: Scraped; linkedin: string; instagram: string };
  if (!scraped.linkedin.ok && !scraped.instagram.ok)
    return Response.json({ error: "Both sources failed to scrape: " + [scraped.linkedin.error, scraped.instagram.error].filter(Boolean).join(" / ") }, { status: 422 });
  try {
    const profile = await askJSON<Profile>({
      model: ANALYZE_MODEL,
      system: ANALYZE_SYSTEM,
      maxTokens: 1800,
      temperature: 0.3,
      messages: [{
        role: "user",
        content: `LINKEDIN (${linkedin}) [${scraped.linkedin.source}]:\n${scraped.linkedin.text || "(unavailable: " + scraped.linkedin.error + ")"}\n\nINSTAGRAM (${instagram}) [${scraped.instagram.source}]:\n${scraped.instagram.text || "(unavailable: " + scraped.instagram.error + ")"}`,
      }],
    });
    for (const k of ["needs", "hobbies", "interests", "values", "personality", "dealbreakers", "evidence"] as const) profile[k] ??= [];
    return Response.json({ profile });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
