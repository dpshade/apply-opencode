import { WikiLinkStrategy, WikiLinkMode } from "./settings";

export interface WikiLinkSpan {
  start: number;
  end: number;
  text: string;
  alias?: string;
}

/**
 * Find all occurrences of existing note titles in content.
 * This is the fast path - no AI needed.
 */
export function findTitleMatches(content: string, titles: string[]): WikiLinkSpan[] {
  const spans: WikiLinkSpan[] = [];

  // Sort titles by length descending to match longer titles first
  // This prevents "John" from matching before "John Smith"
  const sortedTitles = [...titles].sort((a, b) => b.length - a.length);

  // Track which positions are already matched to avoid overlaps
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const title of sortedTitles) {
    if (title.length < 2) continue; // Skip very short titles

    // Case-insensitive search, but we'll use the exact text from content
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();

    let searchStart = 0;
    while (true) {
      const index = lowerContent.indexOf(lowerTitle, searchStart);
      if (index === -1) break;

      const end = index + title.length;

      // Check if this position overlaps with an existing match
      const overlaps = matchedRanges.some(
        range => (index >= range.start && index < range.end) ||
                 (end > range.start && end <= range.end)
      );

      if (!overlaps) {
        // Check word boundaries to avoid matching substrings
        const charBefore = index > 0 ? content[index - 1] : " ";
        const charAfter = end < content.length ? content[end] : " ";
        const isWordBoundaryBefore = /[\s[\](){}<>,.:;!?"'\-/]/.test(charBefore);
        const isWordBoundaryAfter = /[\s[\](){}<>,.:;!?"'\-/]/.test(charAfter);

        if (isWordBoundaryBefore && isWordBoundaryAfter) {
          // Use the exact text from content (preserves original case)
          const exactText = content.slice(index, end);
          spans.push({
            start: index,
            end: end,
            text: exactText,
          });
          matchedRanges.push({ start: index, end: end });
        }
      }

      searchStart = index + 1;
    }
  }

  return spans;
}

/**
 * Validates that only wiki link brackets were added, with no content changes.
 * Returns true if the modification is valid (only bracket additions).
 */
export function validateWikiLinkChanges(original: string, modified: string): boolean {
  // Strip all wiki link syntax: [[...]] and [[...|...]]
  const stripWikiLinks = (s: string): string => {
    // First handle aliased links: [[target|display]] -> display
    let stripped = s.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1");
    // Then handle simple links: [[text]] -> text
    stripped = stripped.replace(/\[\[([^\]]+)\]\]/g, "$1");
    return stripped;
  };

  const strippedOriginal = stripWikiLinks(original);
  const strippedModified = stripWikiLinks(modified);

  return strippedOriginal === strippedModified;
}

/**
 * Applies wiki link spans to content by wrapping text at specified positions.
 * Spans must be sorted by start position descending to avoid offset shifts.
 */
export function applyWikiLinkSpans(content: string, spans: WikiLinkSpan[]): string {
  // Sort by start position descending so we don't mess up offsets
  const sortedSpans = [...spans].sort((a, b) => b.start - a.start);

  let result = content;
  for (const span of sortedSpans) {
    const before = result.slice(0, span.start);
    const text = result.slice(span.start, span.end);
    const after = result.slice(span.end);

    // Verify the text matches what we expect
    if (text !== span.text) {
      console.warn(`[Wiki Links] Span mismatch: expected "${span.text}", got "${text}"`);
      continue;
    }

    if (span.alias) {
      result = `${before}[[${span.alias}|${text}]]${after}`;
    } else {
      result = `${before}[[${text}]]${after}`;
    }
  }

  return result;
}

/**
 * Checks if a position is inside a code block or existing wiki link.
 */
export function isInExcludedZone(content: string, start: number, end: number): boolean {
  // Check for frontmatter (starts at position 0 with ---)
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterMatch && start < frontmatterMatch[0].length) {
    return true;
  }

  // Check if inside existing wiki link
  const wikiLinkRegex = /\[\[[^\]]+\]\]/g;
  let match;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    if (start >= match.index && end <= match.index + match[0].length) {
      return true;
    }
  }

  // Check if inside code block
  const codeBlockRegex = /```[\s\S]*?```|`[^`\n]+`/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (start >= match.index && end <= match.index + match[0].length) {
      return true;
    }
  }

  return false;
}

/**
 * Filters spans to only include the first mention of each entity.
 */
export function filterFirstMentions(spans: WikiLinkSpan[]): WikiLinkSpan[] {
  const seen = new Set<string>();
  const result: WikiLinkSpan[] = [];

  // Sort by position to get first mentions
  const sorted = [...spans].sort((a, b) => a.start - b.start);

  for (const span of sorted) {
    const key = span.text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(span);
    }
  }

  return result;
}

/**
 * Filters spans to only include entities that match existing note titles.
 */
export function filterToExistingNotes(spans: WikiLinkSpan[], existingTitles: string[]): WikiLinkSpan[] {
  const titleSet = new Set(existingTitles.map(t => t.toLowerCase()));
  return spans.filter(span => titleSet.has(span.text.toLowerCase()));
}

export interface GenerateWikiLinksOptions {
  content: string;
  existingTitles: string[];
  strategy: WikiLinkStrategy;
  mode: WikiLinkMode;
  identifyEntities?: (content: string, existingTitles: string[]) => Promise<WikiLinkSpan[]>;
}

/**
 * Main function to generate wiki links for content.
 * Returns the modified content with wiki links added.
 *
 * For "existing-only" strategy: Uses fast string matching (no AI).
 * For "all-entities" strategy: Uses AI to identify additional entities.
 */
export async function generateWikiLinks(options: GenerateWikiLinksOptions): Promise<string> {
  const { content, existingTitles, strategy, mode, identifyEntities } = options;

  let spans: WikiLinkSpan[];

  if (strategy === "existing-only") {
    // Fast path: just find existing note titles in content
    spans = findTitleMatches(content, existingTitles);
  } else {
    // AI path for "all-entities" strategy
    if (!identifyEntities) {
      throw new Error("identifyEntities function required for all-entities strategy");
    }
    spans = await identifyEntities(content, existingTitles);
  }

  // Filter out spans in excluded zones (frontmatter, code blocks, existing links)
  spans = spans.filter(span => !isInExcludedZone(content, span.start, span.end));

  // Apply mode filter
  if (mode === "first") {
    spans = filterFirstMentions(spans);
  }

  // Apply the wiki links
  const modified = applyWikiLinkSpans(content, spans);

  // Validate that only brackets were added
  if (!validateWikiLinkChanges(content, modified)) {
    throw new Error("Wiki link generation attempted to modify content beyond adding brackets");
  }

  return modified;
}
