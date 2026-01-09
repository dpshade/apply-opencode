import { spawn } from "child_process";
import { getSkillManager } from "./skills";

export interface CanvasGeneratorOptions {
  opencodePath: string;
  model: string;
}

interface OpenCodeJsonEvent {
  type: string;
  part?: {
    type: string;
    text?: string;
  };
}

interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
  subpath?: string;
  background?: string;
  backgroundStyle?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
}

interface CanvasData {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
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
    console.debug("[Apply OpenCode] Running OpenCode for Canvas generation, prompt length:", prompt.length);
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

function cleanJsonResponse(response: string): string {
  let json = response.trim();

  // Remove markdown fences
  if (json.startsWith("```json")) {
    json = json.slice(7);
  } else if (json.startsWith("```")) {
    json = json.slice(3);
  }
  if (json.endsWith("```")) {
    json = json.slice(0, -3);
  }
  
  // Find the JSON object boundaries
  const startBrace = json.indexOf("{");
  const endBrace = json.lastIndexOf("}");
  
  if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
    json = json.slice(startBrace, endBrace + 1);
  }
  
  return json.trim();
}

/**
 * Validate that the generated content is valid Canvas JSON
 */
export function validateCanvas(content: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(content) as CanvasData;
    
    if (!parsed || typeof parsed !== "object") {
      return { valid: false, error: "Invalid JSON structure" };
    }

    // Canvas must have nodes or edges arrays (both optional but at least one should exist)
    if (!parsed.nodes && !parsed.edges) {
      return { valid: false, error: "Canvas must have 'nodes' or 'edges' array" };
    }

    // Validate nodes if present
    if (parsed.nodes) {
      if (!Array.isArray(parsed.nodes)) {
        return { valid: false, error: "'nodes' must be an array" };
      }

      const nodeIds = new Set<string>();
      for (let i = 0; i < parsed.nodes.length; i++) {
        const node = parsed.nodes[i];
        
        // Check required fields
        if (!node.id) {
          return { valid: false, error: `Node ${i + 1} is missing 'id'` };
        }
        if (nodeIds.has(node.id)) {
          return { valid: false, error: `Duplicate node id: ${node.id}` };
        }
        nodeIds.add(node.id);

        if (!node.type) {
          return { valid: false, error: `Node ${i + 1} is missing 'type'` };
        }
        if (!["text", "file", "link", "group"].includes(node.type)) {
          return { valid: false, error: `Node ${i + 1} has invalid type: ${node.type}` };
        }

        if (typeof node.x !== "number" || typeof node.y !== "number") {
          return { valid: false, error: `Node ${i + 1} has invalid x/y coordinates` };
        }
        if (typeof node.width !== "number" || typeof node.height !== "number") {
          return { valid: false, error: `Node ${i + 1} has invalid width/height` };
        }

        // Type-specific validation
        if (node.type === "text" && typeof node.text !== "string") {
          return { valid: false, error: `Text node ${i + 1} is missing 'text' field` };
        }
        if (node.type === "file" && typeof node.file !== "string") {
          return { valid: false, error: `File node ${i + 1} is missing 'file' field` };
        }
        if (node.type === "link" && typeof node.url !== "string") {
          return { valid: false, error: `Link node ${i + 1} is missing 'url' field` };
        }
      }

      // Validate edges if present
      if (parsed.edges) {
        if (!Array.isArray(parsed.edges)) {
          return { valid: false, error: "'edges' must be an array" };
        }

        const edgeIds = new Set<string>();
        for (let i = 0; i < parsed.edges.length; i++) {
          const edge = parsed.edges[i];

          if (!edge.id) {
            return { valid: false, error: `Edge ${i + 1} is missing 'id'` };
          }
          if (edgeIds.has(edge.id)) {
            return { valid: false, error: `Duplicate edge id: ${edge.id}` };
          }
          edgeIds.add(edge.id);

          if (!edge.fromNode || !edge.toNode) {
            return { valid: false, error: `Edge ${i + 1} is missing 'fromNode' or 'toNode'` };
          }

          // Check that referenced nodes exist
          if (!nodeIds.has(edge.fromNode)) {
            return { valid: false, error: `Edge ${i + 1} references non-existent node: ${edge.fromNode}` };
          }
          if (!nodeIds.has(edge.toNode)) {
            return { valid: false, error: `Edge ${i + 1} references non-existent node: ${edge.toNode}` };
          }

          // Validate side values if present
          const validSides = ["top", "right", "bottom", "left"];
          if (edge.fromSide && !validSides.includes(edge.fromSide)) {
            return { valid: false, error: `Edge ${i + 1} has invalid fromSide: ${edge.fromSide}` };
          }
          if (edge.toSide && !validSides.includes(edge.toSide)) {
            return { valid: false, error: `Edge ${i + 1} has invalid toSide: ${edge.toSide}` };
          }

          // Validate end shapes if present
          const validEnds = ["none", "arrow"];
          if (edge.fromEnd && !validEnds.includes(edge.fromEnd)) {
            return { valid: false, error: `Edge ${i + 1} has invalid fromEnd: ${edge.fromEnd}` };
          }
          if (edge.toEnd && !validEnds.includes(edge.toEnd)) {
            return { valid: false, error: `Edge ${i + 1} has invalid toEnd: ${edge.toEnd}` };
          }
        }
      }
    }

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `JSON parse error: ${message}` };
  }
}

/**
 * Generate a new JSON Canvas from natural language description
 */
export async function generateCanvas(
  description: string,
  options: CanvasGeneratorOptions
): Promise<string> {
  const skillManager = getSkillManager();
  const skillContent = skillManager.getSkill("json-canvas");

  const prompt = `${skillContent}

---

Generate a JSON Canvas file (.canvas) based on this description:

${description}

RULES:
1. Output ONLY valid JSON for the .canvas file
2. Do NOT include markdown fences (\`\`\`json or \`\`\`)
3. Do NOT include any explanation or commentary
4. The output must be directly usable as a .canvas file
5. Use 16-character hexadecimal IDs for nodes and edges
6. Follow the layout guidelines for positioning and sizing
7. Include appropriate nodes, edges, and groups based on the description

Output the .canvas JSON content:`;

  const response = await runOpenCode(options.opencodePath, options.model, prompt);
  const cleaned = cleanJsonResponse(response);
  
  // Pretty-print the JSON for readability
  try {
    const parsed = JSON.parse(cleaned) as CanvasData;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return cleaned;
  }
}

/**
 * Edit an existing JSON Canvas based on instruction
 */
export async function editCanvas(
  currentContent: string,
  instruction: string,
  options: CanvasGeneratorOptions
): Promise<string> {
  const skillManager = getSkillManager();
  const skillContent = skillManager.getSkill("json-canvas");

  const prompt = `${skillContent}

---

Current .canvas file content:
${currentContent}

---

Edit instruction: ${instruction}

RULES:
1. Output the complete modified .canvas file content
2. Output ONLY valid JSON - no markdown fences, no explanation
3. Preserve existing node/edge IDs unless removing them
4. Generate new 16-character hex IDs for any new nodes/edges
5. The output must be directly usable as a .canvas file

Output the modified .canvas JSON content:`;

  const response = await runOpenCode(options.opencodePath, options.model, prompt);
  const cleaned = cleanJsonResponse(response);
  
  // Pretty-print the JSON for readability
  try {
    const parsed = JSON.parse(cleaned) as CanvasData;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return cleaned;
  }
}

/**
 * Generate a suggested filename from the description
 */
export function suggestCanvasFilename(description: string): string {
  // Extract first few meaningful words
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);
  
  if (words.length === 0) {
    return "new-canvas";
  }
  
  return words.join("-");
}
