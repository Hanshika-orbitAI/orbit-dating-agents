export function extractJSON<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model returned no JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
