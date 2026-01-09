import { parseYaml, stringifyYaml } from "obsidian";

export interface FrontmatterData {
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): { frontmatter: FrontmatterData | null; body: string; raw: string | null } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content, raw: null };
  }

  const rawYaml = match[1];
  const body = match[2];

  try {
    const frontmatter = parseYaml(rawYaml) as FrontmatterData;
    return { frontmatter: frontmatter || {}, body, raw: rawYaml };
  } catch {
    return { frontmatter: null, body: content, raw: null };
  }
}

export function mergeFrontmatter(existing: FrontmatterData, enhanced: FrontmatterData): FrontmatterData {
  const merged: FrontmatterData = { ...existing };

  for (const [key, newValue] of Object.entries(enhanced)) {
    const existingValue = merged[key];

    if (existingValue === undefined || existingValue === null || existingValue === "") {
      merged[key] = newValue;
      continue;
    }

    if (Array.isArray(existingValue) && Array.isArray(newValue)) {
      const existingArr = existingValue as unknown[];
      const newArr = newValue as unknown[];
      const existingSet = new Set(existingArr.map(String));
      const additions = newArr.filter((item) => !existingSet.has(String(item)));
      merged[key] = [...existingArr, ...additions];
      continue;
    }

    if (typeof existingValue === "string" && typeof newValue === "string") {
      if (newValue.length > existingValue.length && newValue.includes(existingValue)) {
        merged[key] = newValue;
      }
      continue;
    }
  }

  return merged;
}

export function buildContent(frontmatter: FrontmatterData, body: string): string {
  const yamlContent = stringifyYaml(frontmatter).trim();
  return `---\n${yamlContent}\n---\n${body}`;
}
