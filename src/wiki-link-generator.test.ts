import { describe, it, expect } from "vitest";
import {
  findTitleMatches,
  validateWikiLinkChanges,
  applyWikiLinkSpans,
  isInExcludedZone,
  filterFirstMentions,
  filterToExistingNotes,
  generateWikiLinks,
  WikiLinkSpan,
} from "./wiki-link-generator";

describe("findTitleMatches", () => {
  it("finds exact title matches in content", () => {
    const content = "I watched Perfect Days yesterday";
    const titles = ["Perfect Days"];
    
    const result = findTitleMatches(content, titles);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Perfect Days");
    expect(result[0].start).toBe(10);
    expect(result[0].end).toBe(22);
  });

  it("finds case-insensitive matches but preserves original case", () => {
    const content = "Meeting with john smith tomorrow";
    const titles = ["John Smith"];
    
    const result = findTitleMatches(content, titles);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("john smith");
  });

  it("matches longer titles first to avoid partial matches", () => {
    const content = "I saw John and John Smith at the party";
    const titles = ["John", "John Smith"];
    
    const result = findTitleMatches(content, titles);
    
    // Should match "John Smith" first, then "John" separately
    const johnSmithMatch = result.find(r => r.text === "John Smith");
    const johnMatch = result.find(r => r.text === "John" && r.start === 6);
    
    expect(johnSmithMatch).toBeDefined();
    expect(johnMatch).toBeDefined();
  });

  it("respects word boundaries", () => {
    const content = "The Johnson family visited";
    const titles = ["John"];
    
    const result = findTitleMatches(content, titles);
    
    expect(result).toHaveLength(0); // "John" is part of "Johnson"
  });

  it("finds multiple occurrences", () => {
    const content = "Alice met Bob, then Alice left";
    const titles = ["Alice", "Bob"];
    
    const result = findTitleMatches(content, titles);
    
    expect(result).toHaveLength(3);
    expect(result.filter(r => r.text === "Alice")).toHaveLength(2);
  });

  it("skips very short titles", () => {
    const content = "A B C D";
    const titles = ["A", "B"];
    
    const result = findTitleMatches(content, titles);
    
    expect(result).toHaveLength(0);
  });
});

describe("validateWikiLinkChanges", () => {
  it("returns true when only brackets are added", () => {
    const original = "I met John Smith yesterday";
    const modified = "I met [[John Smith]] yesterday";
    
    expect(validateWikiLinkChanges(original, modified)).toBe(true);
  });

  it("returns true for aliased links", () => {
    const original = "I met John yesterday";
    const modified = "I met [[John Smith|John]] yesterday";
    
    expect(validateWikiLinkChanges(original, modified)).toBe(true);
  });

  it("returns false when content is modified", () => {
    const original = "I met John yesterday";
    const modified = "I met [[Bob]] yesterday";
    
    expect(validateWikiLinkChanges(original, modified)).toBe(false);
  });

  it("returns true for multiple links", () => {
    const original = "Alice and Bob met";
    const modified = "[[Alice]] and [[Bob]] met";
    
    expect(validateWikiLinkChanges(original, modified)).toBe(true);
  });
});

describe("applyWikiLinkSpans", () => {
  it("wraps text at specified positions", () => {
    const content = "Hello World";
    const spans: WikiLinkSpan[] = [{ start: 6, end: 11, text: "World" }];
    
    const result = applyWikiLinkSpans(content, spans);
    
    expect(result).toBe("Hello [[World]]");
  });

  it("handles multiple non-overlapping spans", () => {
    const content = "Alice met Bob";
    const spans: WikiLinkSpan[] = [
      { start: 0, end: 5, text: "Alice" },
      { start: 10, end: 13, text: "Bob" },
    ];
    
    const result = applyWikiLinkSpans(content, spans);
    
    expect(result).toBe("[[Alice]] met [[Bob]]");
  });

  it("handles aliased links", () => {
    const content = "Meet Johnny tomorrow";
    const spans: WikiLinkSpan[] = [
      { start: 5, end: 11, text: "Johnny", alias: "John Smith" },
    ];
    
    const result = applyWikiLinkSpans(content, spans);
    
    expect(result).toBe("Meet [[John Smith|Johnny]] tomorrow");
  });

  it("skips spans with mismatched text", () => {
    const content = "Hello World";
    const spans: WikiLinkSpan[] = [
      { start: 6, end: 11, text: "Earth" }, // Mismatch!
    ];
    
    const result = applyWikiLinkSpans(content, spans);
    
    expect(result).toBe("Hello World"); // Unchanged
  });
});

describe("isInExcludedZone", () => {
  it("excludes positions in frontmatter", () => {
    const content = `---
title: Test
---
Body content`;
    
    expect(isInExcludedZone(content, 5, 10)).toBe(true);
    expect(isInExcludedZone(content, 20, 25)).toBe(false);
  });

  it("excludes positions in existing wiki links", () => {
    const content = "See [[Existing Link]] for more";
    
    expect(isInExcludedZone(content, 6, 18)).toBe(true);
    expect(isInExcludedZone(content, 22, 30)).toBe(false);
  });

  it("excludes positions in code blocks", () => {
    const content = "Normal text ```code block``` more text";
    
    expect(isInExcludedZone(content, 15, 20)).toBe(true);
    expect(isInExcludedZone(content, 0, 6)).toBe(false);
  });

  it("excludes positions in inline code", () => {
    const content = "Use `function()` here";
    
    expect(isInExcludedZone(content, 5, 14)).toBe(true);
  });
});

describe("filterFirstMentions", () => {
  it("keeps only first mention of each entity", () => {
    const spans: WikiLinkSpan[] = [
      { start: 0, end: 5, text: "Alice" },
      { start: 10, end: 15, text: "Alice" },
      { start: 20, end: 23, text: "Bob" },
    ];
    
    const result = filterFirstMentions(spans);
    
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Alice");
    expect(result[0].start).toBe(0);
    expect(result[1].text).toBe("Bob");
  });

  it("is case-insensitive", () => {
    const spans: WikiLinkSpan[] = [
      { start: 0, end: 5, text: "Alice" },
      { start: 10, end: 15, text: "alice" },
    ];
    
    const result = filterFirstMentions(spans);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Alice");
  });
});

describe("filterToExistingNotes", () => {
  it("filters to only matching titles", () => {
    const spans: WikiLinkSpan[] = [
      { start: 0, end: 5, text: "Alice" },
      { start: 10, end: 13, text: "Bob" },
    ];
    const existingTitles = ["Alice", "Charlie"];
    
    const result = filterToExistingNotes(spans, existingTitles);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Alice");
  });

  it("is case-insensitive", () => {
    const spans: WikiLinkSpan[] = [
      { start: 0, end: 5, text: "alice" },
    ];
    const existingTitles = ["Alice"];
    
    const result = filterToExistingNotes(spans, existingTitles);
    
    expect(result).toHaveLength(1);
  });
});

describe("generateWikiLinks", () => {
  it("generates links for existing-only strategy", async () => {
    const result = await generateWikiLinks({
      content: "Meeting with Alice and Bob",
      existingTitles: ["Alice", "Bob"],
      strategy: "existing-only",
      mode: "all",
    });
    
    expect(result).toBe("Meeting with [[Alice]] and [[Bob]]");
  });

  it("respects first-mention mode", async () => {
    const result = await generateWikiLinks({
      content: "Alice met Bob. Later Alice saw Charlie.",
      existingTitles: ["Alice", "Bob", "Charlie"],
      strategy: "existing-only",
      mode: "first",
    });
    
    expect(result).toBe("[[Alice]] met [[Bob]]. Later Alice saw [[Charlie]].");
  });

  it("excludes matches in frontmatter", async () => {
    const content = `---
title: Alice Notes
---
Meeting with Alice`;
    
    const result = await generateWikiLinks({
      content,
      existingTitles: ["Alice"],
      strategy: "existing-only",
      mode: "all",
    });
    
    // Only body Alice should be linked
    expect(result).toContain("title: Alice Notes");
    expect(result).toContain("Meeting with [[Alice]]");
  });

  it("throws for all-entities without identifyEntities function", async () => {
    await expect(
      generateWikiLinks({
        content: "Some content",
        existingTitles: [],
        strategy: "all-entities",
        mode: "all",
      })
    ).rejects.toThrow("identifyEntities function required");
  });

  it("uses identifyEntities for all-entities strategy", async () => {
    const mockIdentify = (): Promise<WikiLinkSpan[]> => Promise.resolve([
      { start: 0, end: 5, text: "Alice" },
    ]);
    
    const result = await generateWikiLinks({
      content: "Alice went home",
      existingTitles: [],
      strategy: "all-entities",
      mode: "all",
      identifyEntities: mockIdentify,
    });
    
    expect(result).toBe("[[Alice]] went home");
  });

  it("validates that only brackets were added", async () => {
    // This test verifies the safety check works by using a mock that
    // returns an invalid span (text doesn't match)
    const mockIdentify = (): Promise<WikiLinkSpan[]> => Promise.resolve([
      { start: 0, end: 5, text: "Wrong" }, // Doesn't match "Alice"
    ]);
    
    // Should not throw because applyWikiLinkSpans skips mismatched spans
    const result = await generateWikiLinks({
      content: "Alice went home",
      existingTitles: [],
      strategy: "all-entities",
      mode: "all",
      identifyEntities: mockIdentify,
    });
    
    expect(result).toBe("Alice went home"); // Unchanged
  });
});
