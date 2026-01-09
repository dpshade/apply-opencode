import { App } from "obsidian";
import { spawn } from "child_process";

export interface WeeklySummaryOptions {
  opencodePath: string;
  model: string;
}

export interface WeeklyNote {
  path: string;
  title: string;
  created: number;
  modified: number;
  isNew: boolean;
  content: string;
  tags: string[];
  folder: string;
}

interface OpenCodeJsonEvent {
  type: string;
  part?: {
    type: string;
    text?: string;
  };
}

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_IN_WEEK = 7;

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
    console.debug("[Apply OpenCode] Running OpenCode for weekly summary, prompt length:", prompt.length);
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

/**
 * Collect all notes created or modified in the past 7 days
 */
export async function collectWeeklyNotes(app: App): Promise<WeeklyNote[]> {
  const now = Date.now();
  const weekAgo = now - (DAYS_IN_WEEK * MS_PER_DAY);
  const notes: WeeklyNote[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    const created = file.stat.ctime;
    const modified = file.stat.mtime;

    // Include if created or modified in past 7 days
    if (created >= weekAgo || modified >= weekAgo) {
      const cache = app.metadataCache.getFileCache(file);
      
      // Get tags
      const tags: string[] = [];
      if (cache?.frontmatter?.tags) {
        const fmTags = Array.isArray(cache.frontmatter.tags)
          ? cache.frontmatter.tags
          : [cache.frontmatter.tags];
        tags.push(...fmTags.map((t: string) => String(t)));
      }
      if (cache?.tags) {
        tags.push(...cache.tags.map((t: { tag: string }) => t.tag.replace(/^#/, "")));
      }

      // Read content (truncate for large files)
      let content = "";
      try {
        const fullContent = await app.vault.read(file);
        content = fullContent.length > 2000
          ? fullContent.slice(0, 2000) + "\n... (truncated)"
          : fullContent;
      } catch {
        content = "(unable to read)";
      }

      notes.push({
        path: file.path,
        title: file.basename,
        created,
        modified,
        isNew: created >= weekAgo,
        content,
        tags: [...new Set(tags)],
        folder: file.parent?.path || "",
      });
    }
  }

  // Sort by modified date, most recent first
  notes.sort((a, b) => b.modified - a.modified);

  return notes;
}

/**
 * Format notes data for the prompt
 */
function formatNotesForPrompt(notes: WeeklyNote[]): string {
  const newNotes = notes.filter(n => n.isNew);
  const modifiedNotes = notes.filter(n => !n.isNew);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  let output = "";

  if (newNotes.length > 0) {
    output += `## NEW NOTES (${newNotes.length})\n\n`;
    for (const note of newNotes) {
      output += `### ${note.title}\n`;
      output += `- Path: ${note.path}\n`;
      output += `- Created: ${formatDate(note.created)}\n`;
      if (note.tags.length > 0) {
        output += `- Tags: ${note.tags.join(", ")}\n`;
      }
      output += `\nContent:\n${note.content}\n\n---\n\n`;
    }
  }

  if (modifiedNotes.length > 0) {
    output += `## MODIFIED NOTES (${modifiedNotes.length})\n\n`;
    for (const note of modifiedNotes) {
      output += `### ${note.title}\n`;
      output += `- Path: ${note.path}\n`;
      output += `- Modified: ${formatDate(note.modified)}\n`;
      if (note.tags.length > 0) {
        output += `- Tags: ${note.tags.join(", ")}\n`;
      }
      output += `\nContent:\n${note.content}\n\n---\n\n`;
    }
  }

  return output;
}

/**
 * Compute basic statistics about the week's activity
 */
function computeStats(notes: WeeklyNote[]): string {
  const newCount = notes.filter(n => n.isNew).length;
  const modifiedCount = notes.filter(n => !n.isNew).length;

  // Tag frequency
  const tagCounts: Record<string, number> = {};
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => `${tag} (${count})`);

  // Folder activity
  const folderCounts: Record<string, number> = {};
  for (const note of notes) {
    const folder = note.folder || "(root)";
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;
  }
  const topFolders = Object.entries(folderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([folder, count]) => `${folder} (${count})`);

  // Activity by day
  const dayActivity: Record<string, number> = {};
  for (const note of notes) {
    const day = new Date(note.isNew ? note.created : note.modified)
      .toLocaleDateString("en-US", { weekday: "long" });
    dayActivity[day] = (dayActivity[day] || 0) + 1;
  }

  return `ACTIVITY STATISTICS:
- New notes: ${newCount}
- Modified notes: ${modifiedCount}
- Total activity: ${notes.length} notes

Top tags: ${topTags.length > 0 ? topTags.join(", ") : "(none)"}

Most active folders: ${topFolders.join(", ")}

Activity by day: ${Object.entries(dayActivity).map(([d, c]) => `${d}: ${c}`).join(", ")}
`;
}

/**
 * Generate a weekly summary using AI
 */
export async function generateWeeklySummary(
  notes: WeeklyNote[],
  options: WeeklySummaryOptions
): Promise<string> {
  if (notes.length === 0) {
    return "No notes were created or modified in the past 7 days.";
  }

  const stats = computeStats(notes);
  const notesContent = formatNotesForPrompt(notes);

  const prompt = `You are analyzing a personal knowledge base (Obsidian vault) to provide a weekly summary.

${stats}

---

${notesContent}

---

Provide a comprehensive weekly summary that includes:

1. **Overview**: A 2-3 sentence high-level summary of what the user worked on this week.

2. **Key Themes**: What topics, projects, or areas received the most attention? Look for patterns across notes.

3. **Notable Progress**: Highlight any significant developments, completions, or milestones evident from the notes.

4. **Connections**: Identify any interesting relationships between notes or topics that emerged this week.

5. **Open Threads**: What work appears to be in progress or might need follow-up?

6. **Reflection Prompts**: 2-3 thoughtful questions the user might consider based on their week's activity.

Format the response in clean Markdown suitable for an Obsidian note. Be specific and reference actual note titles when relevant. Keep the tone helpful and insightful, not generic.`;

  return runOpenCode(options.opencodePath, options.model, prompt);
}
