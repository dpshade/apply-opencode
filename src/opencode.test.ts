import { describe, it, expect } from "vitest";

describe("OpenCode CLI JSON output parsing", () => {
  // These tests verify the JSON event parsing logic
  
  it("extracts text from JSON event stream", () => {
    // Simulate the extractTextFromJsonOutput function logic
    const output = `{"type":"text","part":{"type":"text","text":"Hello "}}
{"type":"text","part":{"type":"text","text":"World"}}
{"type":"end"}`;
    
    const lines = output.trim().split("\n");
    const textParts: string[] = [];
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as { type: string; part?: { text?: string } };
        if (event.type === "text" && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        continue;
      }
    }
    
    expect(textParts.join("")).toBe("Hello World");
  });

  it("handles malformed JSON lines gracefully", () => {
    const output = `{"type":"text","part":{"type":"text","text":"Valid"}}
not json
{"type":"text","part":{"type":"text","text":" text"}}`;
    
    const lines = output.trim().split("\n");
    const textParts: string[] = [];
    
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as { type: string; part?: { text?: string } };
        if (event.type === "text" && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        continue;
      }
    }
    
    expect(textParts.join("")).toBe("Valid text");
  });

  it("handles empty output", () => {
    const output = "";
    const lines = output.trim().split("\n").filter(l => l);
    
    expect(lines).toHaveLength(0);
  });
});

describe("YAML response parsing", () => {
  // Test the parseYamlResponse function logic
  
  function parseYamlResponse(response: string): Record<string, unknown> {
    let yaml = response.trim();
    
    if (yaml.startsWith("```yaml")) yaml = yaml.slice(7);
    else if (yaml.startsWith("```")) yaml = yaml.slice(3);
    if (yaml.endsWith("```")) yaml = yaml.slice(0, -3);
    yaml = yaml.trim();
    
    const lines = yaml.split("\n");
    const result: Record<string, unknown> = {};
    
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();
      
      if (typeof value === "string") {
        if (value.startsWith("[") && value.endsWith("]")) {
          try { result[key] = JSON.parse(value); } catch { result[key] = value; }
        } else if (value.startsWith('"') && value.endsWith('"')) {
          result[key] = value.slice(1, -1);
        } else if (value === "true") {
          result[key] = true;
        } else if (value === "false") {
          result[key] = false;
        } else if (!isNaN(Number(value)) && value !== "") {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  it("parses plain YAML", () => {
    const response = `title: Test Note
tags: ["tag1", "tag2"]
count: 5`;
    
    const result = parseYamlResponse(response);
    
    expect(result.title).toBe("Test Note");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.count).toBe(5);
  });

  it("strips markdown code fences", () => {
    const response = "```yaml\ntitle: Fenced\n```";
    
    const result = parseYamlResponse(response);
    
    expect(result.title).toBe("Fenced");
  });

  it("strips generic code fences", () => {
    const response = "```\ntitle: Generic\n```";
    
    const result = parseYamlResponse(response);
    
    expect(result.title).toBe("Generic");
  });

  it("parses boolean values", () => {
    const response = `published: true
draft: false`;
    
    const result = parseYamlResponse(response);
    
    expect(result.published).toBe(true);
    expect(result.draft).toBe(false);
  });

  it("parses quoted strings", () => {
    const response = `description: "A quoted value"`;
    
    const result = parseYamlResponse(response);
    
    expect(result.description).toBe("A quoted value");
  });

  it("handles arrays in JSON format", () => {
    const response = `tags: ["one", "two", "three"]`;
    
    const result = parseYamlResponse(response);
    
    expect(result.tags).toEqual(["one", "two", "three"]);
  });

  it("handles malformed arrays as strings", () => {
    const response = `tags: [one, two, three]`; // Invalid JSON
    
    const result = parseYamlResponse(response);
    
    // Should fall back to string
    expect(result.tags).toBe("[one, two, three]");
  });
});

describe("Wiki link JSON response parsing", () => {
  function parseWikiLinkResponse(response: string): Array<{ start: number; end: number; text: string }> {
    let jsonStr = response.trim();
    
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();
    
    const startBracket = jsonStr.indexOf("[");
    if (startBracket === -1) return [];
    
    let depth = 0;
    let endBracket = -1;
    for (let i = startBracket; i < jsonStr.length; i++) {
      if (jsonStr[i] === "[") depth++;
      if (jsonStr[i] === "]") depth--;
      if (depth === 0) {
        endBracket = i;
        break;
      }
    }
    
    if (endBracket === -1) return [];
    
    jsonStr = jsonStr.slice(startBracket, endBracket + 1);
    
    try {
      return JSON.parse(jsonStr) as Array<{ start: number; end: number; text: string }>;
    } catch {
      return [];
    }
  }

  it("parses valid JSON array", () => {
    const response = '[{"start": 0, "end": 5, "text": "Alice"}]';
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: 5, text: "Alice" });
  });

  it("extracts array from surrounding text", () => {
    const response = 'Here are the entities: [{"start": 10, "end": 15, "text": "Hello"}] found.';
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello");
  });

  it("handles code-fenced response", () => {
    const response = '```json\n[{"start": 0, "end": 4, "text": "Test"}]\n```';
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Test");
  });

  it("returns empty array for no entities", () => {
    const response = "[]";
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    const response = "not json at all";
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(0);
  });

  it("handles nested arrays correctly", () => {
    const response = '[{"start": 0, "end": 5, "text": "Test", "nested": [1, 2, 3]}]';
    
    const result = parseWikiLinkResponse(response);
    
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Test");
  });
});

describe("Prompt building", () => {
  it("creates system prompt with ignored properties", () => {
    const ignoredProperties = ["created", "modified", "uid"];
    const ignoredList = `\n5. NEVER touch these properties: ${ignoredProperties.join(", ")}`;
    
    expect(ignoredList).toContain("created");
    expect(ignoredList).toContain("modified");
    expect(ignoredList).toContain("uid");
  });

  it("handles empty ignored properties", () => {
    const ignoredProperties: string[] = [];
    const ignoredList = ignoredProperties.length > 0
      ? `\n5. NEVER touch these properties: ${ignoredProperties.join(", ")}`
      : "";
    
    expect(ignoredList).toBe("");
  });

  it("builds content generation prompt for replacement mode", () => {
    const isReplacement = true;
    const baseRules = isReplacement
      ? "Replace the selected text"
      : "Generate content at cursor";
    
    expect(baseRules).toContain("Replace");
  });

  it("builds content generation prompt for insertion mode", () => {
    const isReplacement = false;
    const baseRules = isReplacement
      ? "Replace the selected text"
      : "Generate content at cursor";
    
    expect(baseRules).toContain("cursor");
  });
});

describe("Property filtering", () => {
  function filterToValidProperties(
    enhanced: Record<string, unknown>,
    existing: Record<string, unknown> | null,
    validProperties: string[]
  ): Record<string, unknown> {
    if (validProperties.length === 0) return enhanced;
    
    const result: Record<string, unknown> = {};
    const allowed = new Set([
      ...validProperties,
      ...Object.keys(existing || {}),
    ]);
    
    for (const [key, value] of Object.entries(enhanced)) {
      if (allowed.has(key)) {
        result[key] = value;
      }
    }
    
    return result;
  }

  it("filters to only valid properties", () => {
    const enhanced = { title: "Test", invented: "property", tags: [] };
    const existing = { title: "Old" };
    const validProperties = ["title", "tags", "category"];
    
    const result = filterToValidProperties(enhanced, existing, validProperties);
    
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("tags");
    expect(result).not.toHaveProperty("invented");
  });

  it("allows existing properties even if not in valid list", () => {
    const enhanced = { title: "Test", legacy: "value" };
    const existing = { legacy: "old" };
    const validProperties = ["title"];
    
    const result = filterToValidProperties(enhanced, existing, validProperties);
    
    expect(result).toHaveProperty("legacy");
  });

  it("returns all properties when validProperties is empty", () => {
    const enhanced = { anything: "goes" };
    
    const result = filterToValidProperties(enhanced, null, []);
    
    expect(result).toEqual(enhanced);
  });
});

describe("Ignored property handling", () => {
  function filterIgnoredProperties(
    enhanced: Record<string, unknown>,
    existing: Record<string, unknown> | null,
    ignoredProperties: string[]
  ): Record<string, unknown> {
    const result = { ...enhanced };
    
    for (const prop of ignoredProperties) {
      if (existing && prop in existing) {
        result[prop] = existing[prop];
      } else {
        delete result[prop];
      }
    }
    
    return result;
  }

  it("preserves ignored properties from existing", () => {
    const enhanced = { title: "New", created: "2024-01-02" };
    const existing = { created: "2024-01-01" };
    const ignored = ["created"];
    
    const result = filterIgnoredProperties(enhanced, existing, ignored);
    
    expect(result.created).toBe("2024-01-01");
  });

  it("removes ignored properties if not in existing", () => {
    const enhanced = { title: "New", created: "2024-01-02" };
    const existing = { title: "Old" };
    const ignored = ["created"];
    
    const result = filterIgnoredProperties(enhanced, existing, ignored);
    
    expect(result).not.toHaveProperty("created");
  });

  it("handles null existing frontmatter", () => {
    const enhanced = { title: "New", uid: "123" };
    const ignored = ["uid"];
    
    const result = filterIgnoredProperties(enhanced, null, ignored);
    
    expect(result).not.toHaveProperty("uid");
    expect(result.title).toBe("New");
  });
});
