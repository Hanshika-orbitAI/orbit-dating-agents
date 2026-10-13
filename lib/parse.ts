export const parseLines = (raw: string) =>
  raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const urls = l.match(/https?:\/\/[^\s,|;]+/g) ?? [];
    const linkedin = urls.find((u) => /linkedin\.com\/in\//i.test(u)) ?? "";
    const instagram = urls.find((u) => /instagram\.com\/[^/]+/i.test(u)) ?? "";
    return { line: i + 1, linkedin, instagram };
  });
