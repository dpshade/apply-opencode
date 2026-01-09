import { App, Modal, stringifyYaml } from "obsidian";
import { FrontmatterData } from "./frontmatter";
import { preloadDiffHTML } from "@pierre/diffs/ssr";
import { DiffStyle } from "./settings";



export interface DiffModalResult {
  applied: boolean;
  modifiedYaml: string;
}

export class DiffModal extends Modal {
  private beforeYaml: string;
  private afterYaml: string;
  private modifiedAfterYaml: string;
  private diffStyle: DiffStyle;
  private diffContainer: HTMLElement | null = null;
  private resolvePromise: ((value: DiffModalResult) => void) | null = null;
  private resolved = false;

  constructor(
    app: App,
    beforeYaml: string,
    afterYaml: string,
    diffStyle: DiffStyle,
  ) {
    super(app);
    this.beforeYaml = beforeYaml;
    this.afterYaml = afterYaml;
    this.modifiedAfterYaml = afterYaml;
    this.diffStyle = diffStyle;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    // Apply class to parent .modal element for styling
    modalEl.addClass("apply-opencode-diff-modal");

    contentEl.createEl("h2", { text: "Review frontmatter changes" });

    this.diffContainer = contentEl.createDiv({ cls: "diff-container" });
    await this.renderDiff();

    const buttonContainer = contentEl.createDiv({ cls: "diff-buttons" });

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "mod-warning",
    });
    cancelBtn.addEventListener("click", () => {
      this.resolve({ applied: false, modifiedYaml: this.modifiedAfterYaml });
      this.close();
    });

    const applyBtn = buttonContainer.createEl("button", {
      text: "Apply changes",
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      this.resolve({ applied: true, modifiedYaml: this.modifiedAfterYaml });
      this.close();
    });
  }

  private async renderDiff() {
    if (!this.diffContainer) return;
    this.diffContainer.empty();

    try {
      const diffHtml = await preloadDiffHTML({
        oldFile: {
          name: "before",
          contents: this.beforeYaml || "",
          lang: "yaml",
        },
        newFile: {
          name: "after",
          contents: this.modifiedAfterYaml || "",
          lang: "yaml",
        },
        options: {
          diffStyle: this.diffStyle,
          diffIndicators: "classic",
          lineDiffType: "word",
          disableLineNumbers: true,
          disableFileHeader: true,
          overflow: "wrap",
        },
      });

      this.diffContainer.innerHTML = diffHtml;
      this.attachClickHandlers();
    } catch (err) {
      console.error(
        "[Apply OpenCode] Failed to render diff with @pierre/diffs:",
        err,
      );
      this.renderFallbackDiff(this.diffContainer);
    }
  }

  private attachClickHandlers() {
    if (!this.diffContainer) return;

    // Find all addition lines (green lines)
    const additionLines = this.diffContainer.querySelectorAll(
      '[data-line-type="change-addition"]',
    );

    additionLines.forEach((lineEl) => {
      lineEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get the text content of the line
        const contentEl = lineEl.querySelector("[data-column-content]");
        if (!contentEl) return;

        const lineContent = contentEl.textContent || "";
        void this.removeLine(lineContent);
      });
    });
  }

  private async removeLine(content: string) {
    const lines = this.modifiedAfterYaml.split("\n");
    const index = lines.findIndex((line) => line === content);
    if (index === -1) return;

    // Check if this is a property line (ends with ":" or has ": " in it)
    const isPropertyLine = /^[a-zA-Z_][a-zA-Z0-9_]*:/.test(content.trim());
    
    if (isPropertyLine) {
      // Remove this line and all indented children
      const baseIndent = content.match(/^(\s*)/)?.[1].length || 0;
      let endIndex = index + 1;
      
      // Find all subsequent lines that are more indented (children)
      while (endIndex < lines.length) {
        const line = lines[endIndex];
        // Empty lines or lines with greater indentation are children
        if (line.trim() === "") {
          endIndex++;
          continue;
        }
        const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;
        if (lineIndent > baseIndent) {
          endIndex++;
        } else {
          break;
        }
      }
      
      // Remove all lines from index to endIndex
      lines.splice(index, endIndex - index);
    } else {
      // Single line removal (e.g., array item like "  - foo")
      lines.splice(index, 1);
    }

    this.modifiedAfterYaml = lines.join("\n");
    await this.renderDiff();
  }

  private renderFallbackDiff(container: HTMLElement) {
    const beforeLines = this.beforeYaml ? this.beforeYaml.split("\n") : [];
    const afterLines = this.afterYaml ? this.afterYaml.split("\n") : [];

    const removedLines = beforeLines.filter(
      (line) => !afterLines.includes(line),
    );

    removedLines.forEach((line) => {
      const lineEl = container.createDiv({ cls: "diff-line diff-removed" });
      lineEl.createSpan({ cls: "diff-prefix", text: "-" });
      lineEl.createSpan({ cls: "diff-content", text: line });
    });

    afterLines.forEach((line) => {
      const isAdded = !beforeLines.includes(line);
      const cls = isAdded ? "diff-added" : "diff-unchanged";
      const prefix = isAdded ? "+" : " ";

      const lineEl = container.createDiv({ cls: "diff-line " + cls });
      lineEl.createSpan({ cls: "diff-prefix", text: prefix });
      lineEl.createSpan({ cls: "diff-content", text: line });
    });
  }

  onClose() {
    this.resolve({ applied: false, modifiedYaml: this.modifiedAfterYaml });
    this.contentEl.empty();
  }

  private resolve(value: DiffModalResult) {
    if (!this.resolved && this.resolvePromise) {
      this.resolved = true;
      this.resolvePromise(value);
    }
  }

  waitForResult(): Promise<DiffModalResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export function frontmatterToYaml(data: FrontmatterData): string {
  return stringifyYaml(data).trim();
}

export async function showDiffModal(
  app: App,
  before: FrontmatterData | null,
  after: FrontmatterData,
  diffStyle: DiffStyle,
): Promise<DiffModalResult | null> {
  const beforeYaml = before ? frontmatterToYaml(before) : "";
  const afterYaml = frontmatterToYaml(after);

  console.log("[Apply OpenCode] Diff modal - before:", beforeYaml);
  console.log("[Apply OpenCode] Diff modal - after:", afterYaml);

  if (beforeYaml === afterYaml) {
    console.log("[Apply OpenCode] No changes detected, skipping modal");
    return null;
  }

  const modal = new DiffModal(app, beforeYaml, afterYaml, diffStyle);
  modal.open();
  return modal.waitForResult();
}
