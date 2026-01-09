import { App, TFile } from "obsidian";
import { parseFrontmatter, FrontmatterData } from "./frontmatter";

/** Scoring weights for similar note detection */
const SCORE = {
  BASE_HAS_FRONTMATTER: 5,
  SAME_FOLDER: 3,
  SUBFOLDER: 1,
  PER_TAG_OVERLAP: 4,
  LINK_CONNECTION: 8,
  SUPERSET_BASE: 10,
  PER_EXTRA_PROP: 2,
  PER_SHARED_PROP: 2,
  RICHNESS_CAP: 5,
  RECENT_7_DAYS: 2,
  RECENT_30_DAYS: 1,
} as const;

const DAYS = {
  RECENT: 7,
  MODERATE: 30,
} as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
  const currentLinks = extractLinks(currentContent);
  const { frontmatter: currentFm } = parseFrontmatter(currentContent);
  const currentProps = currentFm ? Object.keys(currentFm) : [];

  const scored: Array<{ file: TFile; score: number }> = [];

  for (const file of files) {
    if (file.path === currentFile.path) continue;

    const cache = app.metadataCache.getFileCache(file);
    
    // Only consider files with frontmatter (we need examples to learn from)
    if (!cache?.frontmatter) continue;
    
    let score = SCORE.BASE_HAS_FRONTMATTER;

    // Folder proximity (minor bonus, not primary signal)
    if (file.parent?.path === currentFolder) {
      score += SCORE.SAME_FOLDER;
    } else if (currentFolder && file.path.startsWith(currentFolder)) {
      score += SCORE.SUBFOLDER;
    }

    // Tag overlap (strong signal)
    if (cache.frontmatter.tags) {
      const fileTags = Array.isArray(cache.frontmatter.tags)
        ? cache.frontmatter.tags
        : [cache.frontmatter.tags];
      const overlap = fileTags.filter((t: string) => currentTags.includes(String(t))).length;
      score += overlap * SCORE.PER_TAG_OVERLAP;
    }

    // Link connections (strong signal for flat vaults)
    const fileBasename = file.basename.toLowerCase();
    if (currentLinks.some(link => link.toLowerCase() === fileBasename)) {
      score += SCORE.LINK_CONNECTION;
    }
    
    // Check if this file links to current file
    if (cache.links) {
      const linksToCurrentFile = cache.links.some(
        (link: { link: string }) => link.link.toLowerCase() === currentFile.basename.toLowerCase()
      );
      if (linksToCurrentFile) {
        score += SCORE.LINK_CONNECTION;
      }
    }

    // Frontmatter superset detection (strongest signal)
    // If candidate has all props current file has + more, it's a great example
    const candidateProps = Object.keys(cache.frontmatter);
    const currentPropsInCandidate = currentProps.filter(p => candidateProps.includes(p));
    
    if (currentProps.length > 0 && currentPropsInCandidate.length === currentProps.length) {
      // Candidate is a superset - has all current props
      const extraProps = candidateProps.length - currentProps.length;
      score += SCORE.SUPERSET_BASE + (extraProps * SCORE.PER_EXTRA_PROP);
    } else if (currentPropsInCandidate.length > 0) {
      // Partial overlap
      score += currentPropsInCandidate.length * SCORE.PER_SHARED_PROP;
    }
    
    // Frontmatter richness (more properties = better example)
    score += Math.min(candidateProps.length, SCORE.RICHNESS_CAP);

    // Recency (minor signal)
    const daysSinceModified = (Date.now() - file.stat.mtime) / MS_PER_DAY;
    if (daysSinceModified < DAYS.RECENT) score += SCORE.RECENT_7_DAYS;
    else if (daysSinceModified < DAYS.MODERATE) score += SCORE.RECENT_30_DAYS;

    scored.push({ file, score });
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

function extractLinks(content: string): string[] {
  // Match [[link]] and [[link|alias]] patterns
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

export interface ExamplesPromptData {
  promptText: string;
  validProperties: string[];
  propertyOrder: string[];
  vaultTags: string[];
}

/**
 * Collect all unique tags used across the vault
 */
export function collectVaultTags(app: App): string[] {
  const tags = new Set<string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;

    // Tags from frontmatter
    if (cache.frontmatter?.tags) {
      const fmTags = Array.isArray(cache.frontmatter.tags)
        ? cache.frontmatter.tags
        : [cache.frontmatter.tags];
      fmTags.forEach((t: string) => tags.add(String(t)));
    }

    // Inline tags from body
    if (cache.tags) {
      cache.tags.forEach((t: { tag: string }) => tags.add(t.tag.replace(/^#/, "")));
    }
  }

  return [...tags].sort();
}

/**
 * Get all note titles (basenames) in the vault for semantic search mode.
 * Excludes the current file being processed.
 */
export function getAllNoteTitles(app: App, excludeFile?: TFile): string[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => !excludeFile || file.path !== excludeFile.path)
    .map((file) => file.basename)
    .sort();
}

/**
 * Determine the canonical property order based on frequency of appearance order in examples
 */
function computePropertyOrder(examples: SimilarNote[]): string[] {
  // Track the average position of each property across examples
  const positionSums: Record<string, number> = {};
  const positionCounts: Record<string, number> = {};

  for (const example of examples) {
    const keys = Object.keys(example.frontmatter);
    keys.forEach((key, index) => {
      positionSums[key] = (positionSums[key] || 0) + index;
      positionCounts[key] = (positionCounts[key] || 0) + 1;
    });
  }

  // Calculate average position for each property
  const avgPositions: Array<{ key: string; avg: number }> = [];
  for (const key of Object.keys(positionSums)) {
    avgPositions.push({
      key,
      avg: positionSums[key] / positionCounts[key],
    });
  }

  // Sort by average position (properties that appear earlier on average come first)
  avgPositions.sort((a, b) => a.avg - b.avg);
  return avgPositions.map(p => p.key);
}

export function formatExamplesForPrompt(
  examples: SimilarNote[],
  vaultTags: string[] = [],
  allTitles?: string[]
): ExamplesPromptData {
  if (examples.length === 0 && !allTitles?.length) {
    return { promptText: "", validProperties: [], propertyOrder: [], vaultTags };
  }

  // Compute canonical property order from examples
  const propertyOrder = computePropertyOrder(examples);
  const validProperties = [...propertyOrder]; // Same properties, just ordered

  const formatted = examples
    .map((ex, i) => {
      const yaml = Object.entries(ex.frontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      return `Example ${i + 1} (${ex.path}):\n${yaml}`;
    })
    .join("\n\n");

  // Include vault tags if available (limit to 50 most common to avoid huge prompts)
  const tagsSection = vaultTags.length > 0
    ? `\n\nEXISTING TAGS IN VAULT: ${vaultTags.slice(0, 50).join(", ")}${vaultTags.length > 50 ? ` (and ${vaultTags.length - 50} more)` : ""}
STRONGLY prefer using existing tags from this list. Only create a new tag if it clearly follows the vault's tagging conventions and no existing tag fits.`
    : "";

  // Include all titles for semantic mode (bridge/wikilink suggestions)
  const titlesSection = allTitles && allTitles.length > 0
    ? `\n\nVAULT NOTE TITLES (for suggesting wikilinks/bridges):
${allTitles.map((t) => `- ${t}`).join("\n")}

When suggesting wikilinks or bridge connections, prefer linking to notes from this list.`
    : "";

  const examplesSection = examples.length > 0
    ? `
EXAMPLES OF FRONTMATTER FROM SIMILAR NOTES IN THIS VAULT:
${formatted}

VALID PROPERTIES (only use these, in this preferred order): ${propertyOrder.join(", ")}`
    : "";

  const promptText = `${examplesSection}${tagsSection}${titlesSection}

Use a similar style, structure, and field names as these examples. Do NOT invent new property names.
Output properties in the order listed above.`;

  return { promptText, validProperties, propertyOrder, vaultTags };
}
