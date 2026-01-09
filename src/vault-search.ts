import { App, TFile } from "obsidian";
import { parseFrontmatter, FrontmatterData } from "./frontmatter";

export interface SimilarNote {
  path: string;
  frontmatter: FrontmatterData;
}

export async function findSimilarNotes(
  app: App,
  currentFile: TFile,
  currentContent: string,
  limit: number = 5
): Promise<SimilarNote[]> {
  const files = app.vault.getMarkdownFiles();
  const currentFolder = currentFile.parent?.path || "";
  const currentTags = extractTags(currentContent);

  const scored: Array<{ file: TFile; score: number }> = [];

  for (const file of files) {
    if (file.path === currentFile.path) continue;

    let score = 0;

    if (file.parent?.path === currentFolder) {
      score += 10;
    } else if (currentFolder && file.path.startsWith(currentFolder)) {
      score += 5;
    }

    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatter) {
      score += 3;

      if (cache.frontmatter.tags) {
        const fileTags = Array.isArray(cache.frontmatter.tags)
          ? cache.frontmatter.tags
          : [cache.frontmatter.tags];
        const overlap = fileTags.filter((t: string) => currentTags.includes(String(t))).length;
        score += overlap * 2;
      }
    }

    const mtime = file.stat.mtime;
    const daysSinceModified = (Date.now() - mtime) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 7) score += 2;
    else if (daysSinceModified < 30) score += 1;

    if (score > 0) {
      scored.push({ file, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topFiles = scored.slice(0, limit);

  const results: SimilarNote[] = [];
  for (const { file } of topFiles) {
    try {
      const content = await app.vault.read(file);
      const { frontmatter } = parseFrontmatter(content);
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        results.push({ path: file.path, frontmatter });
      }
    } catch {
      continue;
    }
  }

  return results;
}

function extractTags(content: string): string[] {
  const tags: string[] = [];

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const tagMatch = fmMatch[1].match(/tags:\s*\[([^\]]*)\]/);
    if (tagMatch) {
      tags.push(...tagMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")));
    }
  }

  const inlineTags = content.match(/#[\w-]+/g);
  if (inlineTags) {
    tags.push(...inlineTags.map((t) => t.slice(1)));
  }

  return [...new Set(tags)];
}

export interface ExamplesPromptData {
  promptText: string;
  validProperties: string[];
}

export function formatExamplesForPrompt(examples: SimilarNote[]): ExamplesPromptData {
  if (examples.length === 0) {
    return { promptText: "", validProperties: [] };
  }

  // Extract unique property names from all examples
  const validProperties = [...new Set(examples.flatMap(ex => Object.keys(ex.frontmatter)))];

  const formatted = examples
    .map((ex, i) => {
      const yaml = Object.entries(ex.frontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      return `Example ${i + 1} (${ex.path}):\n${yaml}`;
    })
    .join("\n\n");

  const promptText = `
EXAMPLES OF FRONTMATTER FROM SIMILAR NOTES IN THIS VAULT:
${formatted}

VALID PROPERTIES (only use these): ${validProperties.join(", ")}

Use a similar style, structure, and field names as these examples. Do NOT invent new property names.`;

  return { promptText, validProperties };
}
