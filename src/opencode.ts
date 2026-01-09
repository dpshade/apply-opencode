import { spawn } from "child_process";
import { FrontmatterData } from "./frontmatter";
import { SimilarNote, formatExamplesForPrompt, ExamplesPromptData } from "./vault-search";

export interface OpenCodeOptions {
  opencodePath: string;
  model: string;
  customPrompt: string;
  ignoredProperties: string[];
  maxListItems: number;
  examples: SimilarNote[];
}

export interface EnhanceResult {
  frontmatter: FrontmatterData;
  validProperties: string[];
}

function buildSystemPrompt(options: OpenCodeOptions, examplesData: ExamplesPromptData): string {
  const ignoredList = options.ignoredProperties.length > 0
    ? `\n5. NEVER touch these properties: ${options.ignoredProperties.join(", ")}`
    : "";

  return `You are a frontmatter enhancement assistant. Given a markdown note, analyze its content and suggest frontmatter improvements.

RULES:
1. NEVER remove or overwrite existing field values
2. For array fields (like tags), you may ADD new items but never remove existing ones
3. For string fields, you may EXTEND the content but never replace it entirely
4. Output ONLY valid YAML frontmatter (no markdown fences, no explanations)${ignoredList}
6. ONLY use property names that appear in the examples below - do NOT invent new properties
7. For list/array properties, include at most ${options.maxListItems} items unless truly exceptional
8. Match the style and field names used in the example frontmatter from this vault
${examplesData.promptText}

Analyze the note content and output enhanced frontmatter YAML only.`;
}

export async function enhanceFrontmatter(
  noteContent: string,
  existingFrontmatter: FrontmatterData | null,
  options: OpenCodeOptions
): Promise<EnhanceResult> {
  const existingYaml = existingFrontmatter
    ? Object.entries(existingFrontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "(no existing frontmatter)";

  const examplesData = formatExamplesForPrompt(options.examples);
  const systemPrompt = buildSystemPrompt(options, examplesData);

  const userPrompt = `EXISTING FRONTMATTER:
${existingYaml}

NOTE CONTENT:
${noteContent}

${options.customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${options.customPrompt}\n\n` : ""}Output enhanced frontmatter YAML only:`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await runOpenCode(options.opencodePath, options.model, fullPrompt);
  const parsed = parseYamlResponse(response);
  const filtered = filterIgnoredProperties(parsed, existingFrontmatter, options.ignoredProperties);
  const finalFrontmatter = filterToValidProperties(filtered, existingFrontmatter, examplesData.validProperties);
  
  return {
    frontmatter: finalFrontmatter,
    validProperties: examplesData.validProperties,
  };
}

function filterIgnoredProperties(
  enhanced: FrontmatterData,
  existing: FrontmatterData | null,
  ignoredProperties: string[]
): FrontmatterData {
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

function filterToValidProperties(
  enhanced: FrontmatterData,
  existing: FrontmatterData | null,
  validProperties: string[]
): FrontmatterData {
  // If no examples found, allow all properties (fallback)
  if (validProperties.length === 0) {
    return enhanced;
  }

  const result: FrontmatterData = {};
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

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";

function resolveOpenCodePath(path: string): string {
  if (path && path !== "opencode") return path;
  return DEFAULT_OPENCODE_PATH;
}

interface OpenCodeJsonEvent {
  type: string;
  part?: {
    type: string;
    text?: string;
  };
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
    console.log("[Apply OpenCode] Running OpenCode:", resolvedPath, "with prompt length:", prompt.length);
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
      console.log("[Apply OpenCode] OpenCode exited with code:", code);
      console.log("[Apply OpenCode] Raw stdout length:", stdout.length);
      if (code === 0) {
        const text = extractTextFromJsonOutput(stdout);
        console.log("[Apply OpenCode] Extracted text:", text.slice(0, 500));
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

function parseYamlResponse(response: string): FrontmatterData {
  let yaml = response.trim();

  if (yaml.startsWith("```yaml")) {
    yaml = yaml.slice(7);
  } else if (yaml.startsWith("```")) {
    yaml = yaml.slice(3);
  }
  if (yaml.endsWith("```")) {
    yaml = yaml.slice(0, -3);
  }
  yaml = yaml.trim();

  const lines = yaml.split("\n");
  const result: FrontmatterData = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
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

  return result;
}
