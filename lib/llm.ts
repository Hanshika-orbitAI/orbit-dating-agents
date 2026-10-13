import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
const get = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export const ANALYZE_MODEL = process.env.ANALYZE_MODEL || "claude-sonnet-5-5";
export const DATE_MODEL = process.env.DATE_MODEL || "claude-haiku-5-5";

export async function ask(opts: {
  model: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await get().messages.create({
        model: opts.model,
        system: opts.system,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.8,
      });
      return r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    } catch (e: any) {
      if (attempt < 3 && (e?.status === 429 || e?.status >= 500)) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

export function extractJSON<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model returned no JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function askJSON<T>(opts: Parameters<typeof ask>[0]): Promise<T> {
  const text = await ask(opts);
  try {
    return extractJSON<T>(text);
  } catch {
    const retry = await ask({
      ...opts,
      messages: [...opts.messages, { role: "assistant", content: text }, { role: "user", content: "That was not valid JSON. Reply with ONLY the JSON object." }],
      temperature: 0,
    });
    return extractJSON<T>(retry);
  }
}
