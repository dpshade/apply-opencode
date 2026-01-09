import { describe, it, expect } from "vitest";
import { TitleExtractor } from "./title-generator";

describe("TitleExtractor.extractTitle", () => {
  describe("JSON parsing", () => {
    it("extracts title from valid JSON", () => {
      const response = '{"title": "Meeting Notes"}';
      
      expect(TitleExtractor.extractTitle(response)).toBe("Meeting Notes");
    });

    it("extracts title from JSON in code block", () => {
      const response = '```json\n{"title": "Project Plan"}\n```';
      
      expect(TitleExtractor.extractTitle(response)).toBe("Project Plan");
    });

    it("extracts title from code block without json tag", () => {
      const response = '```\n{"title": "Simple Block"}\n```';
      
      expect(TitleExtractor.extractTitle(response)).toBe("Simple Block");
    });
  });

  describe("JSON pattern matching", () => {
    it("extracts from malformed JSON-like pattern", () => {
      const response = "Here's your title: { 'title': 'Database Schema' }";
      
      expect(TitleExtractor.extractTitle(response)).toBe("Database Schema");
    });

    it("handles double quotes in pattern", () => {
      const response = '{"title": "API Design"}';
      
      expect(TitleExtractor.extractTitle(response)).toBe("API Design");
    });
  });

  describe("Quote extraction", () => {
    it("extracts title from quoted string", () => {
      const response = 'I suggest "Project Planning Meeting" as the title.';
      
      expect(TitleExtractor.extractTitle(response)).toBe("Project Planning Meeting");
    });

    it("extracts from single quotes", () => {
      const response = "The title should be 'Error Handling Guide'";
      
      expect(TitleExtractor.extractTitle(response)).toBe("Error Handling Guide");
    });

    it("rejects quoted strings that are too short", () => {
      // The quote "A" is rejected, but first-line extraction may still work
      // Test the actual quote rejection behavior
      const response = '"A"';
      
      // Single character in quotes should be rejected
      expect(TitleExtractor.extractTitle(response)).toBeNull();
    });

    it("rejects quoted strings that are too long", () => {
      const response = `"${"word ".repeat(20)}"`;
      
      // Should be rejected as too many words
      const result = TitleExtractor.extractTitle(response);
      expect(result === null || result.split(/\s+/).length <= 5).toBe(true);
    });
  });

  describe("First line extraction", () => {
    it("extracts clean first line as title", () => {
      const response = "Python Error Handling\n\nThis is additional explanation.";
      
      expect(TitleExtractor.extractTitle(response)).toBe("Python Error Handling");
    });

    it("strips title: prefix", () => {
      const response = "title: Meeting Summary\nMore text here.";
      
      expect(TitleExtractor.extractTitle(response)).toBe("Meeting Summary");
    });

    it("rejects single word first lines", () => {
      const response = "Word\nMore content here with multiple words.";
      
      expect(TitleExtractor.extractTitle(response)).toBeNull();
    });

    it("rejects very long first lines", () => {
      const longLine = "word ".repeat(50);
      const response = `${longLine}\nNormal content.`;
      
      expect(TitleExtractor.extractTitle(response)).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("returns null for empty response", () => {
      expect(TitleExtractor.extractTitle("")).toBeNull();
      expect(TitleExtractor.extractTitle("   ")).toBeNull();
    });

    it("returns null for null input", () => {
      expect(TitleExtractor.extractTitle(null as unknown as string)).toBeNull();
    });

    it("handles response with only whitespace", () => {
      expect(TitleExtractor.extractTitle("\n\n\t  \n")).toBeNull();
    });
  });
});

describe("TitleExtractor.validateAndCleanTitle", () => {
  it("removes unsafe filename characters", () => {
    const title = 'Test: A "Good" Title?';
    
    const result = TitleExtractor.validateAndCleanTitle(title);
    
    expect(result).toBe("Test- A Good Title-");
    expect(result).not.toContain(":");
    expect(result).not.toContain('"');
    expect(result).not.toContain("?");
  });

  it("collapses multiple spaces", () => {
    const title = "Too   Many    Spaces";
    
    expect(TitleExtractor.validateAndCleanTitle(title)).toBe("Too Many Spaces");
  });

  it("trims whitespace", () => {
    const title = "  Padded Title  ";
    
    expect(TitleExtractor.validateAndCleanTitle(title)).toBe("Padded Title");
  });

  it("rejects titles that are too short", () => {
    expect(TitleExtractor.validateAndCleanTitle("A")).toBeNull();
    expect(TitleExtractor.validateAndCleanTitle("")).toBeNull();
  });

  it("rejects titles that are too long", () => {
    const longTitle = "word ".repeat(50);
    
    expect(TitleExtractor.validateAndCleanTitle(longTitle)).toBeNull();
  });

  it("rejects titles with too many words", () => {
    const manyWords = "one two three four five six seven eight nine ten eleven";
    
    expect(TitleExtractor.validateAndCleanTitle(manyWords)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(TitleExtractor.validateAndCleanTitle(null as unknown as string)).toBeNull();
  });

  it("accepts reasonable titles", () => {
    expect(TitleExtractor.validateAndCleanTitle("Meeting Notes")).toBe("Meeting Notes");
    expect(TitleExtractor.validateAndCleanTitle("Project Plan 2024")).toBe("Project Plan 2024");
    expect(TitleExtractor.validateAndCleanTitle("Q1 Budget Review")).toBe("Q1 Budget Review");
  });

  it("removes backticks", () => {
    const title = "`Code` Review Notes";
    
    expect(TitleExtractor.validateAndCleanTitle(title)).toBe("Code Review Notes");
  });
});
