import { App, TFile, TFolder } from "obsidian";

export interface FileExample {
  path: string;
  content: string;
}

export interface VaultContext {
  folders: string[];
  tags: string[];
  properties: string[];
  noteTitles: string[];
  baseExamples: FileExample[];
  canvasExamples: FileExample[];
  relevantNotes: FileExample[];
}

export interface CollectVaultContextOptions {
  /** Keywords to find relevant notes */
  keywords?: string[];
  /** File type context: 'base' | 'canvas' | 'general' */
  fileType?: "base" | "canvas" | "general";
  /** Maximum number of example files to include */
  maxExamples?: number;
}

/**
 * Collect vault context for AI generation prompts.
 * Includes folders, tags, frontmatter properties, note titles, and example files.
 */
export async function collectVaultContext(
  app: App, 
  excludeFile?: TFile,
  options: CollectVaultContextOptions = {}
): Promise<VaultContext> {
  const { keywords = [], fileType = "general", maxExamples = 3 } = options;
  
  const folders = collectFolders(app);
  const tags = collectTags(app);
  const properties = collectProperties(app);
  const noteTitles = collectNoteTitles(app, excludeFile);
  
  // Collect example files based on file type
  const baseExamples = fileType === "base" || fileType === "general"
    ? await collectBaseExamples(app, excludeFile, maxExamples)
    : [];
  const canvasExamples = fileType === "canvas" || fileType === "general"
    ? await collectCanvasExamples(app, excludeFile, maxExamples)
    : [];
  
  // Find relevant notes based on keywords
  const relevantNotes = keywords.length > 0
    ? await findRelevantNotes(app, keywords, excludeFile, maxExamples)
    : [];

  return { folders, tags, properties, noteTitles, baseExamples, canvasExamples, relevantNotes };
}

/**
 * Get all folder paths in the vault
 */
function collectFolders(app: App): string[] {
  const folders: string[] = [];
  
  const traverse = (folder: TFolder) => {
    // Include all folders except root
    if (folder.path) {
      folders.push(folder.path);
    }
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        traverse(child);
      }
    }
  };

  const root = app.vault.getRoot();
  traverse(root);

  return folders.sort();
}

/**
 * Collect all unique tags used across the vault
 */
function collectTags(app: App): string[] {
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
 * Collect all unique frontmatter property names used across the vault
 */
function collectProperties(app: App): string[] {
  const props = new Set<string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) continue;

    for (const key of Object.keys(cache.frontmatter)) {
      // Skip internal Obsidian keys
      if (key !== "position") {
        props.add(key);
      }
    }
  }

  return [...props].sort();
}

/**
 * Get all note titles (basenames) in the vault
 */
function collectNoteTitles(app: App, excludeFile?: TFile): string[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => !excludeFile || file.path !== excludeFile.path)
    .map((file) => file.basename)
    .sort();
}

/**
 * Collect example .base files from the vault
 */
async function collectBaseExamples(
  app: App, 
  excludeFile?: TFile, 
  limit: number = 3
): Promise<FileExample[]> {
  const examples: FileExample[] = [];
  const files = app.vault.getFiles()
    .filter(f => f.extension === "base" && f.path !== excludeFile?.path)
    .sort((a, b) => b.stat.mtime - a.stat.mtime) // Most recent first
    .slice(0, limit);

  for (const file of files) {
    try {
      const content = await app.vault.read(file);
      // Limit content size to avoid huge prompts
      const truncated = content.length > 2000 
        ? content.slice(0, 2000) + "\n# ... (truncated)"
        : content;
      examples.push({ path: file.path, content: truncated });
    } catch {
      continue;
    }
  }

  return examples;
}

/**
 * Collect example .canvas files from the vault
 */
async function collectCanvasExamples(
  app: App, 
  excludeFile?: TFile, 
  limit: number = 2
): Promise<FileExample[]> {
  const examples: FileExample[] = [];
  const files = app.vault.getFiles()
    .filter(f => f.extension === "canvas" && f.path !== excludeFile?.path)
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, limit);

  for (const file of files) {
    try {
      const content = await app.vault.read(file);
      // Limit content size - canvas files can be large
      const truncated = content.length > 3000 
        ? content.slice(0, 3000) + '\n// ... (truncated)'
        : content;
      examples.push({ path: file.path, content: truncated });
    } catch {
      continue;
    }
  }

  return examples;
}

/**
 * Find notes relevant to the given keywords
 */
async function findRelevantNotes(
  app: App,
  keywords: string[],
  excludeFile?: TFile,
  limit: number = 5
): Promise<FileExample[]> {
  const normalizedKeywords = keywords.map(k => k.toLowerCase());
  const scored: Array<{ file: TFile; score: number }> = [];

  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path === excludeFile?.path) continue;

    let score = 0;
    const cache = app.metadataCache.getFileCache(file);
    const basename = file.basename.toLowerCase();
    const folderPath = file.parent?.path.toLowerCase() || "";

    // Score based on filename match
    for (const kw of normalizedKeywords) {
      if (basename.includes(kw)) score += 10;
      if (folderPath.includes(kw)) score += 5;
    }

    // Score based on tags
    if (cache?.frontmatter?.tags) {
      const fileTags = Array.isArray(cache.frontmatter.tags)
        ? cache.frontmatter.tags
        : [cache.frontmatter.tags];
      for (const tag of fileTags) {
        const tagLower = String(tag).toLowerCase();
        for (const kw of normalizedKeywords) {
          if (tagLower.includes(kw)) score += 8;
        }
      }
    }

    // Score based on frontmatter values
    if (cache?.frontmatter) {
      for (const value of Object.values(cache.frontmatter)) {
        if (typeof value === "string") {
          const valueLower = value.toLowerCase();
          for (const kw of normalizedKeywords) {
            if (valueLower.includes(kw)) score += 3;
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ file, score });
    }
  }

  // Sort by score and take top results
  scored.sort((a, b) => b.score - a.score);
  const topFiles = scored.slice(0, limit);

  const examples: FileExample[] = [];
  for (const { file } of topFiles) {
    try {
      const content = await app.vault.read(file);
      // Truncate to reasonable size - focus on frontmatter and beginning
      const truncated = content.length > 1500
        ? content.slice(0, 1500) + "\n\n... (truncated)"
        : content;
      examples.push({ path: file.path, content: truncated });
    } catch {
      continue;
    }
  }

  return examples;
}

/**
 * Format vault context for inclusion in AI prompts
 */
export function formatVaultContext(context: VaultContext): string {
  const sections: string[] = [];

  // Folders (limit to 100)
  if (context.folders.length > 0) {
    const folderList = context.folders.slice(0, 100);
    sections.push(`VAULT FOLDERS:
${folderList.join("\n")}${context.folders.length > 100 ? `\n(and ${context.folders.length - 100} more)` : ""}`);
  }

  // Tags (limit to 100)
  if (context.tags.length > 0) {
    const tagList = context.tags.slice(0, 100);
    sections.push(`VAULT TAGS:
${tagList.join(", ")}${context.tags.length > 100 ? ` (and ${context.tags.length - 100} more)` : ""}`);
  }

  // Properties (limit to 50)
  if (context.properties.length > 0) {
    const propList = context.properties.slice(0, 50);
    sections.push(`VAULT PROPERTIES (frontmatter fields):
${propList.join(", ")}${context.properties.length > 50 ? ` (and ${context.properties.length - 50} more)` : ""}`);
  }

  // Note titles (limit to 200)
  if (context.noteTitles.length > 0) {
    const titleList = context.noteTitles.slice(0, 200);
    sections.push(`VAULT NOTE TITLES (for file references):
${titleList.join(", ")}${context.noteTitles.length > 200 ? ` (and ${context.noteTitles.length - 200} more)` : ""}`);
  }

  // Base file examples
  if (context.baseExamples.length > 0) {
    const baseSection = context.baseExamples
      .map(ex => `--- ${ex.path} ---\n${ex.content}`)
      .join("\n\n");
    sections.push(`EXAMPLE .base FILES FROM THIS VAULT (use similar patterns):
${baseSection}`);
  }

  // Canvas file examples
  if (context.canvasExamples.length > 0) {
    const canvasSection = context.canvasExamples
      .map(ex => `--- ${ex.path} ---\n${ex.content}`)
      .join("\n\n");
    sections.push(`EXAMPLE .canvas FILES FROM THIS VAULT (use similar layout patterns):
${canvasSection}`);
  }

  // Relevant notes
  if (context.relevantNotes.length > 0) {
    const notesSection = context.relevantNotes
      .map(ex => `--- ${ex.path} ---\n${ex.content}`)
      .join("\n\n");
    sections.push(`RELEVANT NOTES FROM THIS VAULT (reference these for context):
${notesSection}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `
VAULT CONTEXT - Use exact names from this vault:
${sections.join("\n\n")}

IMPORTANT: When referencing folders, tags, properties, or files, use the EXACT names from the lists above. Do not invent or misspell names.
`;
}

/**
 * Extract keywords from a description for finding relevant notes
 */
export function extractKeywords(description: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not",
    "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "if", "or", "because", "until", "while", "this",
    "that", "these", "those", "what", "which", "who", "whom",
    "create", "make", "show", "display", "list", "filter", "exclude",
    "include", "add", "remove", "edit", "update", "change", "modify",
    "want", "like", "need", "file", "files", "note", "notes", "base", "canvas"
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Return unique keywords
  return [...new Set(words)];
}
