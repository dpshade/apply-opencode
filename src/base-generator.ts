import { spawn } from "child_process";
import { parseYaml } from "obsidian";
import { getSkillManager } from "./skills";
import { VaultContext, formatVaultContext } from "./vault-context";

export interface BaseGeneratorOptions {
  opencodePath: string;
  model: string;
  vaultContext?: VaultContext;
}

interface OpenCodeJsonEvent {
  type: string;
  part?: {
    type: string;
    text?: string;
  };
}

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";

function resolveOpenCodePath(path: string): string {
  if (path && path !== "opencode") return path;
  return DEFAULT_OPENCODE_PATH;
}

function extractTextFromJsonOutput(output: string): string {
  const lines = output.trim().split("\n");
  const textParts: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as OpenCodeJsonEvent;
      if (event.type === "text" && event.part?.text) {
        textParts.push(event.part.text);
      }
    } catch {
      continue;
    }
  }

  return textParts.join("");
}

function runOpenCode(opencodePath: string, model: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["run", "--format", "json", "-m", model, "--", prompt];
    const resolvedPath = resolveOpenCodePath(opencodePath);
    console.debug("[Apply OpenCode] Running OpenCode for Base generation, prompt length:", prompt.length);
    const proc = spawn(resolvedPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.opencode/bin` },
    });

    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const text = extractTextFromJsonOutput(stdout);
        resolve(text);
      } else {
        console.error("[Apply OpenCode] stderr:", stderr);
        reject(new Error(`OpenCode exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn OpenCode: ${err.message}`));
    });
  });
}

function cleanYamlResponse(response: string): string {
  let yaml = response.trim();

  // Remove markdown fences
  if (yaml.startsWith("```yaml")) {
    yaml = yaml.slice(7);
  } else if (yaml.startsWith("```")) {
    yaml = yaml.slice(3);
  }
  if (yaml.endsWith("```")) {
    yaml = yaml.slice(0, -3);
  }
  
  return yaml.trim();
}

interface BaseView {
  type?: string;
  name?: string;
  [key: string]: unknown;
}

interface FilterObject {
  and?: unknown[];
  or?: unknown[];
  not?: unknown[];
  [key: string]: unknown;
}

interface ParsedBase {
  views?: BaseView[];
  filters?: FilterObject;
  formulas?: Record<string, string>;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

const VALID_FILTER_KEYS = ["and", "or", "not"];

/**
 * Validate that a filters object uses only and/or/not keys
 */
function validateFilters(filters: unknown, context: string): { valid: boolean; error?: string } {
  if (!filters || typeof filters !== "object") {
    return { valid: true }; // No filters is fine
  }

  const filterObj = filters as FilterObject;
  const keys = Object.keys(filterObj);
  
  // Filters must have exactly one of: and, or, not
  const validKeys = keys.filter(k => VALID_FILTER_KEYS.includes(k));
  const invalidKeys = keys.filter(k => !VALID_FILTER_KEYS.includes(k));
  
  if (invalidKeys.length > 0) {
    return { 
      valid: false, 
      error: `${context}: filters may only have "and", "or", or "not" keys. Found invalid keys: ${invalidKeys.join(", ")}` 
    };
  }
  
  if (validKeys.length === 0) {
    return { 
      valid: false, 
      error: `${context}: filters must have one of "and", "or", or "not" keys` 
    };
  }
  
  if (validKeys.length > 1) {
    return { 
      valid: false, 
      error: `${context}: filters may only have ONE of "and", "or", or "not" at the top level. Found: ${validKeys.join(", ")}` 
    };
  }

  return { valid: true };
}

/**
 * Validate that the generated content is valid Base YAML
 */
export function validateBase(content: string): { valid: boolean; error?: string } {
  try {
    const parsed = parseYaml(content) as ParsedBase | null;
    
    if (!parsed || typeof parsed !== "object") {
      return { valid: false, error: "Invalid YAML structure" };
    }

    // Check for required 'views' array
    if (!parsed.views || !Array.isArray(parsed.views)) {
      return { valid: false, error: "Base must have a 'views' array" };
    }

    // Validate top-level filters if present
    if (parsed.filters) {
      const filterValidation = validateFilters(parsed.filters, "Top-level filters");
      if (!filterValidation.valid) {
        return filterValidation;
      }
    }

    // Check each view has required fields
    for (let i = 0; i < parsed.views.length; i++) {
      const view = parsed.views[i];
      if (!view.type) {
        return { valid: false, error: `View ${i + 1} is missing 'type' field` };
      }
      if (!["table", "cards", "list", "map"].includes(view.type)) {
        return { valid: false, error: `View ${i + 1} has invalid type: ${view.type}` };
      }
      
      // Validate view-level filters if present
      if (view.filters) {
        const viewFilterValidation = validateFilters(view.filters, `View ${i + 1} (${view.name || view.type}) filters`);
        if (!viewFilterValidation.valid) {
          return viewFilterValidation;
        }
      }
    }

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `YAML parse error: ${message}` };
  }
}

/**
 * Generate a new Obsidian Base from natural language description
 */
export async function generateBase(
  description: string,
  options: BaseGeneratorOptions
): Promise<string> {
  const skillManager = getSkillManager();
  const skillContent = skillManager.getSkill("obsidian-bases");
  const vaultContextSection = options.vaultContext ? formatVaultContext(options.vaultContext) : "";

  const prompt = `${skillContent}

---
${vaultContextSection}
---

Generate an Obsidian Base file (.base) based on this description:

${description}

CRITICAL FILTER SYNTAX RULES:
- Filters MUST use "and:", "or:", or "not:" as the ONLY top-level key
- WRONG: \`filters: file.hasTag("task")\` 
- CORRECT: \`filters:\\n  and:\\n    - file.hasTag("task")\`
- Each condition must be a list item under and/or/not

Example filter structure:
\`\`\`yaml
filters:
  and:
    - file.hasTag("task")
    - 'file.folder != "Archive"'
\`\`\`

OUTPUT RULES:
1. Output ONLY valid YAML for the .base file
2. Do NOT include markdown fences
3. Do NOT include any explanation or commentary
4. Include at least one view in the views array
5. When referencing folders, tags, or properties, use EXACT names from the vault context above

Output the .base YAML content:`;

  const response = await runOpenCode(options.opencodePath, options.model, prompt);
  return cleanYamlResponse(response);
}

/**
 * Edit an existing Obsidian Base based on instruction
 */
export async function editBase(
  currentContent: string,
  instruction: string,
  options: BaseGeneratorOptions
): Promise<string> {
  const skillManager = getSkillManager();
  const skillContent = skillManager.getSkill("obsidian-bases");
  const vaultContextSection = options.vaultContext ? formatVaultContext(options.vaultContext) : "";

  const prompt = `${skillContent}

---
${vaultContextSection}
---

Current .base file content:
${currentContent}

---

Edit instruction: ${instruction}

CRITICAL FILTER SYNTAX RULES:
- Filters MUST use "and:", "or:", or "not:" as the ONLY top-level key
- WRONG: \`filters: file.hasTag("task")\` 
- CORRECT: \`filters:\\n  and:\\n    - file.hasTag("task")\`

OUTPUT RULES:
1. Output the complete modified .base file content
2. Output ONLY valid YAML - no markdown fences, no explanation
3. Preserve existing structure unless the instruction asks to change it
4. When referencing folders, tags, or properties, use EXACT names from the vault context above

Output the modified .base YAML content:`;

  const response = await runOpenCode(options.opencodePath, options.model, prompt);
  return cleanYamlResponse(response);
}

/**
 * Generate a suggested filename from the description
 */
export function suggestBaseFilename(description: string): string {
  // Extract first few meaningful words
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);
  
  if (words.length === 0) {
    return "new-base";
  }
  
  return words.join("-");
}
