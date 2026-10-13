import { isFixture } from "@/lib/fixtures";
export async function GET() {
  return Response.json({ mode: isFixture() ? "fixture" : "live", anthropic: !!process.env.ANTHROPIC_API_KEY, apify: !!process.env.APIFY_TOKEN });
}
