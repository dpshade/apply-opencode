import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  mergeFrontmatter,
  orderFrontmatter,
  buildContent,
} from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const content = `---
title: Test Note
tags: ["tag1", "tag2"]
---
This is the body.`;

    const result = parseFrontmatter(content);
    
    expect(result.frontmatter).toEqual({
      title: "Test Note",
      tags: ["tag1", "tag2"],
    });
    expect(result.body).toBe("This is the body.");
    expect(result.raw).toBe('title: Test Note\ntags: ["tag1", "tag2"]');
  });

  it("returns null frontmatter for content without frontmatter", () => {
    const content = "Just some text without frontmatter";
    
    const result = parseFrontmatter(content);
    
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
    expect(result.raw).toBeNull();
  });

  it("handles empty frontmatter", () => {
    // Note: YAML frontmatter requires at least one newline between ---
    const content = `---

---
Body content`;

    const result = parseFrontmatter(content);
    
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Body content");
  });

  it("handles frontmatter with trailing newline", () => {
    const content = `---
title: Test
---

Body with space`;

    const result = parseFrontmatter(content);
    
    expect(result.frontmatter).toEqual({ title: "Test" });
    expect(result.body).toBe("\nBody with space");
  });
});

describe("mergeFrontmatter", () => {
  it("adds new properties from enhanced", () => {
    const existing = { title: "Test" };
    const enhanced = { title: "Test", tags: ["new"] };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result).toEqual({ title: "Test", tags: ["new"] });
  });

  it("does not overwrite existing values", () => {
    const existing = { title: "Original", description: "Keep me" };
    const enhanced = { title: "New Title", description: "Replace me" };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.title).toBe("Original");
    expect(result.description).toBe("Keep me");
  });

  it("fills in empty string values", () => {
    const existing = { title: "", description: "Existing" };
    const enhanced = { title: "New Title", description: "New Desc" };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.title).toBe("New Title");
    expect(result.description).toBe("Existing");
  });

  it("fills in null values", () => {
    const existing = { title: null, count: 5 };
    const enhanced = { title: "New", count: 10 };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.title).toBe("New");
    expect(result.count).toBe(5);
  });

  it("merges arrays without duplicates", () => {
    const existing = { tags: ["existing", "shared"] };
    const enhanced = { tags: ["shared", "new"] };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.tags).toEqual(["existing", "shared", "new"]);
  });

  it("extends string values if enhanced is superset", () => {
    const existing = { description: "Short" };
    const enhanced = { description: "Short description with more detail" };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.description).toBe("Short description with more detail");
  });

  it("keeps existing string if enhanced is not a superset", () => {
    const existing = { description: "Original description" };
    const enhanced = { description: "Different text" };
    
    const result = mergeFrontmatter(existing, enhanced);
    
    expect(result.description).toBe("Original description");
  });
});

describe("orderFrontmatter", () => {
  it("orders properties according to the specified order", () => {
    const frontmatter = { z: 1, a: 2, m: 3 };
    const order = ["a", "m", "z"];
    
    const result = orderFrontmatter(frontmatter, order);
    
    expect(Object.keys(result)).toEqual(["a", "m", "z"]);
  });

  it("places unordered properties after ordered ones", () => {
    const frontmatter = { extra: 1, title: "Test", tags: ["a"] };
    const order = ["title", "tags"];
    
    const result = orderFrontmatter(frontmatter, order);
    
    expect(Object.keys(result)).toEqual(["title", "tags", "extra"]);
  });

  it("handles missing properties in order gracefully", () => {
    const frontmatter = { title: "Test" };
    const order = ["missing", "title", "also-missing"];
    
    const result = orderFrontmatter(frontmatter, order);
    
    expect(Object.keys(result)).toEqual(["title"]);
    expect(result.title).toBe("Test");
  });

  it("returns original if order is empty", () => {
    const frontmatter = { b: 1, a: 2 };
    
    const result = orderFrontmatter(frontmatter, []);
    
    expect(result).toEqual(frontmatter);
  });
});

describe("buildContent", () => {
  it("builds content with frontmatter and body", () => {
    const frontmatter = { title: "Test" };
    const body = "Body content";
    
    const result = buildContent(frontmatter, body);
    
    expect(result).toContain("---");
    expect(result).toContain("title:");
    expect(result).toContain("Body content");
  });

  it("preserves body content exactly", () => {
    const frontmatter = { key: "value" };
    const body = "Line 1\nLine 2\n\nLine 4";
    
    const result = buildContent(frontmatter, body);
    
    expect(result.endsWith(body)).toBe(true);
  });
});
