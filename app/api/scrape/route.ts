import { scrapeInstagram, scrapeLinkedIn } from "@/lib/scrape";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { linkedin, instagram } = await req.json();
  const [li, ig] = await Promise.all([scrapeLinkedIn(linkedin), scrapeInstagram(instagram)]);
  return Response.json({ linkedin: li, instagram: ig });
}
