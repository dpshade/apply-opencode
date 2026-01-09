// Mock Obsidian module for testing
import { vi } from "vitest";

export const parseYaml = vi.fn((yaml: string) => {
  // Simple YAML parser for tests
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();
    
    // Parse arrays [item1, item2]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if parsing fails
      }
    }
    // Parse booleans
    else if (value === "true") value = true;
    else if (value === "false") value = false;
    // Parse numbers
    else if (!isNaN(Number(value)) && value !== "") value = Number(value);
    
    result[key] = value;
  }
  
  return result;
});

export const stringifyYaml = vi.fn((obj: Record<string, unknown>) => {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
});

export class App {
  vault = {
    getMarkdownFiles: vi.fn(() => []),
    read: vi.fn(async () => ""),
    modify: vi.fn(async () => {}),
  };
  metadataCache = {
    getFileCache: vi.fn(() => null),
  };
  fileManager = {
    renameFile: vi.fn(async () => {}),
  };
}

export class TFile {
  path = "";
  basename = "";
  parent: { path: string } | null = null;
  stat = { mtime: Date.now() };
}

export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class Setting {}
export class Notice {}
