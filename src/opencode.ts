import { spawn } from "child_process";
import { FrontmatterData, parseFrontmatter } from "./frontmatter";
import { SimilarNote, formatExamplesForPrompt, ExamplesPromptData } from "./vault-search";
import { TitleExtractor, TITLE_GENERATION_PROMPT } from "./title-generator";
import { TemplateSchema, formatSchemaForPrompt } from "./template-schema";

export interface OpenCodeOptions {
  opencodePath: string;
  model: string;
  customPrompt: string;
  ignoredProperties: string[];
  maxListItems: number;
  examples: SimilarNote[];
  vaultTags: string[];
  templateSchema?: TemplateSchema | null;
  allTitles?: string[];
}

export interface EnhanceResult {
  frontmatter: FrontmatterData;
  validProperties: string[];
  propertyOrder: string[];
}

export interface TemplateEnhanceOptions {
  opencodePath: string;
  model: string;
  customPrompt: string;
  templateSchema: TemplateSchema;
}

/**
 * Build prompt for template-based enhancement
 * Only fills in the specific properties from the template
 */
function buildTemplatePrompt(schema: TemplateSchema): string {
  const props = schema.properties.map(p => {
    let desc = `- ${p.name} (${p.type})`;
    if (p.options && p.options.length > 0 && p.options.length <= 10) {
      desc += `: choose from [${p.options.join(", ")}]`;
    }
    return desc;
  }).join("\n");

  return `You are a frontmatter assistant. Analyze the note content and generate values for ONLY these specific properties:

${props}

RULES:
1. Output ONLY valid YAML frontmatter (no markdown fences, no explanations)
2. Include ONLY the properties listed above - no extras
3. Use correct types: dates as YYYY-MM-DD, booleans as true/false, numbers without quotes
4. For array/list properties, output as YAML arrays
5. If a property has options listed, choose the most appropriate one(s)
6. If you cannot determine a good value, omit the property entirely

Output the frontmatter YAML only:`;
}

/**
 * Enhance frontmatter using only template-defined properties
 */
export async function enhanceFromTemplate(
  noteContent: string,
  existingFrontmatter: FrontmatterData | null,
  options: TemplateEnhanceOptions
): Promise<EnhanceResult> {
  const existingYaml = existingFrontmatter
    ? Object.entries(existingFrontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "(no existing frontmatter)";

  // Extract just the body to avoid sending frontmatter twice
  const { body } = parseFrontmatter(noteContent);

  const systemPrompt = buildTemplatePrompt(options.templateSchema);
  // Property order comes from template definition order
  const propertyOrder = options.templateSchema.properties.map(p => p.name);
  const validProperties = [...propertyOrder];

  const userPrompt = `EXISTING FRONTMATTER:
${existingYaml}

NOTE CONTENT:
${body}

${options.customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${options.customPrompt}\n\n` : ""}Output frontmatter YAML for the template properties:`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await runOpenCode(options.opencodePath, options.model, fullPrompt);
  const parsed = parseYamlResponse(response);
  
  // Filter to only template properties
  const filtered: FrontmatterData = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (validProperties.includes(key)) {
      filtered[key] = value;
    }
  }

  return {
    frontmatter: filtered,
    validProperties,
    propertyOrder,
  };
}

function buildSystemPrompt(options: OpenCodeOptions, examplesData: ExamplesPromptData): string {
  const ignoredList = options.ignoredProperties.length > 0
    ? `\n5. NEVER touch these properties: ${options.ignoredProperties.join(", ")}`
    : "";

  const templateSection = options.templateSchema 
    ? `\n\n${formatSchemaForPrompt(options.templateSchema)}`
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
9. Use correct types for each property (dates as YYYY-MM-DD, booleans as true/false, numbers without quotes)
${examplesData.promptText}${templateSection}

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

  // Extract just the body to avoid sending frontmatter twice
  const { body } = parseFrontmatter(noteContent);

  const examplesData = formatExamplesForPrompt(options.examples, options.vaultTags, options.allTitles);
  const systemPrompt = buildSystemPrompt(options, examplesData);

  const userPrompt = `EXISTING FRONTMATTER:
${existingYaml}

NOTE CONTENT:
${body}

${options.customPrompt ? `ADDITIONAL INSTRUCTIONS:\n${options.customPrompt}\n\n` : ""}Output enhanced frontmatter YAML only:`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await runOpenCode(options.opencodePath, options.model, fullPrompt);
  const parsed = parseYamlResponse(response);
  const filtered = filterIgnoredProperties(parsed, existingFrontmatter, options.ignoredProperties);
  const finalFrontmatter = filterToValidProperties(filtered, existingFrontmatter, examplesData.validProperties);
  
  return {
    frontmatter: finalFrontmatter,
    validProperties: examplesData.validProperties,
    propertyOrder: examplesData.propertyOrder,
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

export interface TitleGenerationOptions {
  opencodePath: string;
  model: string;
}

export interface ContentGenerationOptions {
  opencodePath: string;
  model: string;
  title: string;
  frontmatter: FrontmatterData | null;
  textBefore: string;
  textAfter: string;
  instruction?: string;
  selectedText?: string;
}

/**
 * Generate a title for note content using OpenCode CLI
 */
export async function generateTitle(
  content: string,
  options: TitleGenerationOptions
): Promise<string | null> {
  // Use first 2000 chars for context (matches auto-title behavior)
  const truncatedContent = content.substring(0, 2000);
  const prompt = TITLE_GENERATION_PROMPT + truncatedContent;

  const response = await runOpenCode(options.opencodePath, options.model, prompt);

  const extractedTitle = TitleExtractor.extractTitle(response);
  if (!extractedTitle) {
    console.debug("[Apply OpenCode] Failed to extract title from response:", response);
    return null;
  }

  const cleanTitle = TitleExtractor.validateAndCleanTitle(extractedTitle);
  if (!cleanTitle) {
    console.debug("[Apply OpenCode] Title failed validation:", extractedTitle);
    return null;
  }

  return cleanTitle;
}

function buildContentGenerationPrompt(instruction?: string, isReplacement = false): string {
  const baseRules = isReplacement
    ? `You are a writing assistant. Replace the selected text based on the context provided.

RULES:
1. Write 500-1000 characters of content unless the user specifies otherwise
2. Match the tone, style, and subject matter of the surrounding content
3. Use the note title and frontmatter as additional context for relevance
4. Output ONLY the replacement text - no explanations, no markdown fences, no meta-commentary
5. The replacement should fit naturally between the text before and after the selection
6. Consider what the selected text was about when writing the replacement`
    : `You are a writing assistant. Generate content based on the context provided.

RULES:
1. Write 500-1000 characters of content unless the user specifies otherwise
2. Match the tone, style, and subject matter of the existing content
3. Use the note title and frontmatter as additional context for relevance
4. Output ONLY the generated text - no explanations, no markdown fences, no meta-commentary
5. Do not repeat or rephrase the existing content
6. If there is text after the cursor position, write content that bridges naturally to it`;

  if (instruction) {
    return `${baseRules}
7. Follow the user's specific instruction for what to write

USER INSTRUCTION: ${instruction}

`;
  }

  return `${baseRules}

`;
}

/**
 * Generate continuation content at cursor position using OpenCode CLI
 * If selectedText is provided, generates replacement content instead
 */
export async function generateContent(
  options: ContentGenerationOptions
): Promise<string | null> {
  const frontmatterContext = options.frontmatter
    ? Object.entries(options.frontmatter)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "(no frontmatter)";

  const contextBefore = options.textBefore.slice(-1500);
  const contextAfter = options.textAfter.slice(0, 500);
  const isReplacement = !!options.selectedText;

  const systemPrompt = buildContentGenerationPrompt(options.instruction, isReplacement);

  let userPrompt = `NOTE TITLE: ${options.title}

FRONTMATTER:
${frontmatterContext}

TEXT BEFORE${isReplacement ? " SELECTION" : " CURSOR"}:
${contextBefore}
`;

  if (isReplacement && options.selectedText) {
    // Truncate large selections to avoid prompt size issues
    const truncatedSelection = options.selectedText.slice(0, 2000);
    userPrompt += `
SELECTED TEXT TO REPLACE:
${truncatedSelection}${options.selectedText.length > 2000 ? "\n[...truncated]" : ""}
`;
  }

  if (contextAfter) {
    userPrompt += `
TEXT AFTER${isReplacement ? " SELECTION" : " CURSOR"}:
${contextAfter}
`;
  }

  userPrompt += `
${isReplacement ? "Generate replacement content:" : "Generate content at cursor position:"}`;

  const fullPrompt = systemPrompt + userPrompt;

  const response = await runOpenCode(options.opencodePath, options.model, fullPrompt);

  if (!response || response.trim().length === 0) {
    console.debug("[Apply OpenCode] Empty response from content generation");
    return null;
  }

  // Clean up any markdown fences that might have slipped through
  let content = response.trim();
  if (content.startsWith("```")) {
    const endFence = content.lastIndexOf("```");
    if (endFence > 3) {
      content = content.slice(content.indexOf("\n") + 1, endFence).trim();
    }
  }

  return content;
}
