import { App, TFile } from "obsidian";
import { parseFrontmatter, FrontmatterData } from "./frontmatter";

/**
 * Property schema extracted from templates
 */
export interface PropertySchema {
  name: string;
  type: "text" | "number" | "date" | "datetime" | "checkbox" | "tags" | "aliases" | "multitext" | "unknown";
  options?: string[]; // For enum-like properties with known values
  example?: unknown;  // Example value from template
}

export interface TemplateSchema {
  templatePath: string;
  properties: PropertySchema[];
}

/**
 * Infer property type from a value
 */
function inferTypeFromValue(value: unknown): PropertySchema["type"] {
  if (value === null || value === undefined) return "text";
  
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  
  if (Array.isArray(value)) {
    // Check if it looks like tags
    if (value.every(v => typeof v === "string")) {
      return "multitext";
    }
    return "multitext";
  }
  
  if (typeof value === "string") {
    // Check for date patterns
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "datetime";
    
    // Check for link pattern [[...]]
    if (/^\[\[.+\]\]$/.test(value)) return "text";
    
    return "text";
  }
  
  return "unknown";
}

/**
 * Extract schema from a template file's frontmatter
 */
function extractSchemaFromFrontmatter(frontmatter: FrontmatterData, path: string): TemplateSchema {
  const properties: PropertySchema[] = [];
  
  for (const [key, value] of Object.entries(frontmatter)) {
    // Skip internal/reserved keys
    if (key.startsWith("_") || key === "position") continue;
    
    // Special handling for known property names
    let type: PropertySchema["type"] = "text";
    let options: string[] | undefined;
    
    if (key === "tags") {
      type = "tags";
    } else if (key === "aliases") {
      type = "aliases";
    } else {
      type = inferTypeFromValue(value);
    }
    
    // If value is an array of strings that look like options, capture them
    if (Array.isArray(value) && value.length > 0 && value.every(v => typeof v === "string")) {
      options = value;
    }
    
    properties.push({
      name: key,
      type,
      options,
      example: value,
    });
  }
  
  return { templatePath: path, properties };
}

/**
 * Find template files in the vault
 * Looks for:
 * 1. Files in a "Templates" folder
 * 2. Files with "template" in the name
 * 3. Files in any folder named *template*
 */
export function findTemplateFiles(app: App): TFile[] {
  const templates: TFile[] = [];
  const seen = new Set<string>();
  
  for (const file of app.vault.getMarkdownFiles()) {
    if (seen.has(file.path)) continue;
    
    const pathLower = file.path.toLowerCase();
    const nameLower = file.basename.toLowerCase();
    
    // Check if in Templates folder or template-like folder
    const inTemplateFolder = pathLower.includes("/templates/") || 
                             pathLower.startsWith("templates/") ||
                             pathLower.includes("/template/") ||
                             pathLower.startsWith("template/");
    
    // Check if file name contains "template"
    const isTemplateFile = nameLower.includes("template");
    
    if (inTemplateFolder || isTemplateFile) {
      templates.push(file);
      seen.add(file.path);
    }
  }
  
  return templates;
}

/**
 * Find the best matching template for a file based on folder or content
 */
export function findMatchingTemplate(
  _app: App,
  file: TFile,
  templates: TemplateSchema[]
): TemplateSchema | null {
  if (templates.length === 0) return null;
  
  const folder = file.parent?.path || "";
  
  // Try to match by folder name
  for (const template of templates) {
    const templateName = template.templatePath.split("/").pop()?.replace(/\.md$/, "").toLowerCase() || "";

    // If template name matches folder name, it's a good match
    if (folder.toLowerCase().includes(templateName) || templateName.includes(folder.toLowerCase())) {
      return template;
    }
  }
  
  // Fall back to first template with properties (most complete)
  const sorted = [...templates].sort((a, b) => b.properties.length - a.properties.length);
  return sorted[0] || null;
}

/**
 * Load all template schemas from the vault
 */
export async function loadTemplateSchemas(app: App): Promise<TemplateSchema[]> {
  const templateFiles = findTemplateFiles(app);
  const schemas: TemplateSchema[] = [];
  
  for (const file of templateFiles) {
    try {
      const content = await app.vault.read(file);
      const { frontmatter } = parseFrontmatter(content);
      
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        schemas.push(extractSchemaFromFrontmatter(frontmatter, file.path));
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }
  
  return schemas;
}

/**
 * Format template schema for inclusion in the AI prompt
 */
export function formatSchemaForPrompt(schema: TemplateSchema): string {
  if (schema.properties.length === 0) return "";
  
  const lines = [`PROPERTY TYPES FROM TEMPLATE (${schema.templatePath}):`];
  
  for (const prop of schema.properties) {
    let desc = `- ${prop.name}: ${prop.type}`;
    
    if (prop.options && prop.options.length > 0 && prop.options.length <= 10) {
      desc += ` (options: ${prop.options.join(", ")})`;
    }
    
    if (prop.example !== undefined && prop.example !== null && prop.example !== "") {
      const exampleStr = JSON.stringify(prop.example);
      if (exampleStr.length < 50) {
        desc += ` [example: ${exampleStr}]`;
      }
    }
    
    lines.push(desc);
  }
  
  lines.push("");
  lines.push("Use these property types when generating frontmatter. For date types, use YYYY-MM-DD format. For checkbox, use true/false.");
  
  return lines.join("\n");
}
