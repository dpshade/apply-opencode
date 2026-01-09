/**
 * Title extraction and validation utilities for AI-generated note titles.
 * Ported from dpshade/auto-title with multi-strategy parsing.
 */

export class TitleExtractor {
  /**
   * Extract title from LLM response using multiple parsing strategies
   */
  static extractTitle(response: string): string | null {
    if (!response || response.trim().length === 0) {
      return null;
    }

    const cleanResponse = response.trim();

    // Strategy 1: Try JSON parsing first
    const jsonTitle = this.extractFromJSON(cleanResponse);
    if (jsonTitle) return jsonTitle;

    // Strategy 2: Extract from code blocks (```json or ```)
    const codeBlockTitle = this.extractFromCodeBlock(cleanResponse);
    if (codeBlockTitle) return codeBlockTitle;

    // Strategy 3: Look for JSON-like patterns without proper formatting
    const jsonPatternTitle = this.extractFromJSONPattern(cleanResponse);
    if (jsonPatternTitle) return jsonPatternTitle;

    // Strategy 4: Extract from quotes
    const quotedTitle = this.extractFromQuotes(cleanResponse);
    if (quotedTitle) return quotedTitle;

    // Strategy 5: Fallback to first line if it looks like a title
    const firstLineTitle = this.extractFromFirstLine(cleanResponse);
    if (firstLineTitle) return firstLineTitle;

    return null;
  }

  private static extractFromJSON(response: string): string | null {
    try {
      const parsed = JSON.parse(response) as { title?: string };
      return parsed.title || null;
    } catch {
      return null;
    }
  }

  private static extractFromCodeBlock(response: string): string | null {
    // Match code blocks, handling newlines without the 's' flag
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = response.match(codeBlockRegex);

    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1].trim()) as { title?: string };
        return parsed.title || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  private static extractFromJSONPattern(response: string): string | null {
    const jsonPatternRegex = /\{\s*["']?title["']?\s*:\s*["']([^"']+)["']\s*\}/i;
    const match = response.match(jsonPatternRegex);
    return match?.[1]?.trim() || null;
  }

  private static extractFromQuotes(response: string): string | null {
    const quotedRegex = /["']([^"']{2,50})["']/;
    const match = response.match(quotedRegex);

    if (match?.[1]) {
      const title = match[1].trim();
      const wordCount = title.split(/\s+/).length;
      if (wordCount >= 2 && wordCount <= 5 && title.length <= 50) {
        return title;
      }
    }
    return null;
  }

  private static extractFromFirstLine(response: string): string | null {
    const firstLine = response.split("\n")[0].trim();

    const cleanLine = firstLine
      .replace(/^(title:\s*|answer:\s*|result:\s*)/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    const wordCount = cleanLine.split(/\s+/).length;
    if (wordCount >= 2 && wordCount <= 8 && cleanLine.length <= 100 && cleanLine.length >= 5) {
      return cleanLine;
    }
    return null;
  }

  /**
   * Validate and clean extracted title for use as filename
   */
  static validateAndCleanTitle(title: string): string | null {
    if (!title) return null;

    const cleaned = title
      .replace(/["`]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    const wordCount = cleaned.split(/\s+/).length;
    if (cleaned.length < 2 || cleaned.length > 100 || wordCount < 1 || wordCount > 10) {
      return null;
    }

    return cleaned;
  }
}

/** Fixed prompt for title generation (not user-customizable for consistency) */
export const TITLE_GENERATION_PROMPT = `Analyze the following note content and create a precise title. Identify the single most important CORE NOUN that represents what this note is about, then add 2-4 helper words that provide essential context.

Respond with ONLY a JSON object in this exact format:
{"title": "your generated title here"}

Examples:
{"title": "Project Planning Meeting"}
{"title": "Database Schema Design"}
{"title": "Python Error Handling"}

The title should be 2-5 words maximum. Do not include quotes around individual words, explanations, or multiple options.

Content to analyze:

`;
