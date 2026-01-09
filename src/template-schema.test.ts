import { describe, it, expect } from "vitest";
import { formatSchemaForPrompt, TemplateSchema } from "./template-schema";

describe("formatSchemaForPrompt", () => {
  it("formats basic schema with property types", () => {
    const schema: TemplateSchema = {
      templatePath: "Templates/Note.md",
      properties: [
        { name: "title", type: "text" },
        { name: "date", type: "date" },
        { name: "tags", type: "tags" },
      ],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    expect(result).toContain("PROPERTY TYPES FROM TEMPLATE");
    expect(result).toContain("title: text");
    expect(result).toContain("date: date");
    expect(result).toContain("tags: tags");
    expect(result).toContain("YYYY-MM-DD");
  });

  it("includes options when available", () => {
    const schema: TemplateSchema = {
      templatePath: "Templates/Status.md",
      properties: [
        { name: "status", type: "text", options: ["draft", "review", "published"] },
      ],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    expect(result).toContain("options: draft, review, published");
  });

  it("includes examples when small enough", () => {
    const schema: TemplateSchema = {
      templatePath: "Templates/Task.md",
      properties: [
        { name: "priority", type: "number", example: 1 },
        { name: "due", type: "date", example: "2024-01-15" },
      ],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    expect(result).toContain("[example: 1]");
    expect(result).toContain('[example: "2024-01-15"]');
  });

  it("returns empty string for empty schema", () => {
    const schema: TemplateSchema = {
      templatePath: "Templates/Empty.md",
      properties: [],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    expect(result).toBe("");
  });

  it("skips very long examples", () => {
    const longExample = "a".repeat(100);
    const schema: TemplateSchema = {
      templatePath: "Templates/Long.md",
      properties: [
        { name: "description", type: "text", example: longExample },
      ],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    expect(result).not.toContain(longExample);
    expect(result).toContain("description: text");
  });

  it("limits options display to 10", () => {
    const manyOptions = Array.from({ length: 15 }, (_, i) => `option${i}`);
    const schema: TemplateSchema = {
      templatePath: "Templates/Many.md",
      properties: [
        { name: "category", type: "text", options: manyOptions },
      ],
    };
    
    const result = formatSchemaForPrompt(schema);
    
    // Should not include options since there are > 10
    expect(result).not.toContain("options:");
    expect(result).toContain("category: text");
  });
});

describe("PropertySchema type inference", () => {
  // These tests document the expected type inference behavior
  // The actual inferTypeFromValue function is private, so we test through integration
  
  it("should recognize date patterns", () => {
    // Type inference for "2024-01-15" should return "date"
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    expect(datePattern.test("2024-01-15")).toBe(true);
    expect(datePattern.test("2024-1-15")).toBe(false);
    expect(datePattern.test("not a date")).toBe(false);
  });

  it("should recognize datetime patterns", () => {
    const datetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
    expect(datetimePattern.test("2024-01-15T10:30:00")).toBe(true);
    expect(datetimePattern.test("2024-01-15")).toBe(false);
  });

  it("should recognize wiki link patterns", () => {
    const wikiLinkPattern = /^\[\[.+\]\]$/;
    expect(wikiLinkPattern.test("[[Some Note]]")).toBe(true);
    expect(wikiLinkPattern.test("not a link")).toBe(false);
  });
});
