import { describe, it, expect } from "vitest";
import { formatExamplesForPrompt, SimilarNote } from "./vault-search";

describe("formatExamplesForPrompt", () => {
  it("formats examples with frontmatter", () => {
    const examples: SimilarNote[] = [
      {
        path: "notes/example1.md",
        frontmatter: { title: "Example 1", tags: ["test"] },
      },
      {
        path: "notes/example2.md",
        frontmatter: { title: "Example 2", category: "docs" },
      },
    ];
    
    const result = formatExamplesForPrompt(examples);
    
    expect(result.promptText).toContain("EXAMPLES OF FRONTMATTER");
    expect(result.promptText).toContain("Example 1");
    expect(result.promptText).toContain("Example 2");
    expect(result.promptText).toContain("notes/example1.md");
    expect(result.validProperties).toContain("title");
    expect(result.validProperties).toContain("tags");
    expect(result.validProperties).toContain("category");
  });

  it("returns empty data for no examples", () => {
    const result = formatExamplesForPrompt([]);
    
    expect(result.promptText).toBe("");
    expect(result.validProperties).toHaveLength(0);
    expect(result.propertyOrder).toHaveLength(0);
  });

  it("includes vault tags when provided", () => {
    const examples: SimilarNote[] = [
      { path: "note.md", frontmatter: { title: "Test" } },
    ];
    const vaultTags = ["project", "meeting", "todo"];
    
    const result = formatExamplesForPrompt(examples, vaultTags);
    
    expect(result.promptText).toContain("EXISTING TAGS IN VAULT");
    expect(result.promptText).toContain("project");
    expect(result.promptText).toContain("meeting");
    expect(result.promptText).toContain("todo");
    expect(result.promptText).toContain("prefer using existing tags");
  });

  it("limits vault tags to 50", () => {
    const examples: SimilarNote[] = [
      { path: "note.md", frontmatter: { title: "Test" } },
    ];
    const manyTags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
    
    const result = formatExamplesForPrompt(examples, manyTags);
    
    expect(result.promptText).toContain("and 50 more");
  });

  it("includes all titles for semantic mode", () => {
    const examples: SimilarNote[] = [
      { path: "note.md", frontmatter: { title: "Test" } },
    ];
    const allTitles = ["Note One", "Note Two", "Note Three"];
    
    const result = formatExamplesForPrompt(examples, [], allTitles);
    
    expect(result.promptText).toContain("VAULT NOTE TITLES");
    expect(result.promptText).toContain("Note One");
    expect(result.promptText).toContain("Note Two");
    expect(result.promptText).toContain("Note Three");
    expect(result.promptText).toContain("wikilinks");
  });

  it("computes property order from examples", () => {
    // If multiple examples have properties in consistent order, 
    // that order should be preserved
    const examples: SimilarNote[] = [
      { path: "a.md", frontmatter: { title: "A", date: "2024", tags: [] } },
      { path: "b.md", frontmatter: { title: "B", date: "2024", category: "x" } },
    ];
    
    const result = formatExamplesForPrompt(examples);
    
    // title should come first (appears first in both)
    expect(result.propertyOrder[0]).toBe("title");
    // date should come second (appears second in both)
    expect(result.propertyOrder[1]).toBe("date");
  });

  it("returns all titles without examples", () => {
    const allTitles = ["Note A", "Note B"];
    
    const result = formatExamplesForPrompt([], [], allTitles);
    
    expect(result.promptText).toContain("Note A");
    expect(result.promptText).toContain("Note B");
  });
});

describe("tag extraction patterns", () => {
  // Test the regex patterns used for tag extraction
  
  it("matches frontmatter tags array format", () => {
    const tagMatch = /tags:\s*\[([^\]]*)\]/;
    const fm = "tags: [tag1, tag2, tag3]";
    
    const match = fm.match(tagMatch);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("tag1, tag2, tag3");
  });

  it("matches inline hashtag format", () => {
    const inlineTagRegex = /#[\w-]+/g;
    const content = "This is #important and #high-priority";
    
    const matches = content.match(inlineTagRegex);
    expect(matches).toEqual(["#important", "#high-priority"]);
  });
});

describe("link extraction patterns", () => {
  it("matches wiki link format", () => {
    const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const content = "See [[Note One]] and [[Note Two|alias]]";
    
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1].trim());
    }
    
    expect(links).toEqual(["Note One", "Note Two"]);
  });
});
