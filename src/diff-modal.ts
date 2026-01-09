import { App, Modal, stringifyYaml } from "obsidian";
import { FrontmatterData } from "./frontmatter";
import { preloadDiffHTML } from "@pierre/diffs/ssr";
import { DiffStyle } from "./settings";

export class DiffModal extends Modal {
  private beforeYaml: string;
  private afterYaml: string;
  private diffStyle: DiffStyle;
  private resolvePromise: ((value: boolean) => void) | null = null;
  private resolved = false;

  constructor(app: App, beforeYaml: string, afterYaml: string, diffStyle: DiffStyle) {
    super(app);
    this.beforeYaml = beforeYaml;
    this.afterYaml = afterYaml;
    this.diffStyle = diffStyle;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("auto-frontmatter-diff-modal");

    contentEl.createEl("h2", { text: "Review frontmatter changes" });

    const diffContainer = contentEl.createDiv({ cls: "diff-container" });

    try {
      const diffHtml = await preloadDiffHTML({
        oldFile: {
          name: "before",
          contents: this.beforeYaml || "",
          lang: "yaml",
        },
        newFile: {
          name: "after",
          contents: this.afterYaml || "",
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

      diffContainer.innerHTML = diffHtml;
    } catch (err) {
      console.error("[Auto Frontmatter] Failed to render diff with @pierre/diffs:", err);
      this.renderFallbackDiff(diffContainer);
    }

    const buttonContainer = contentEl.createDiv({ cls: "diff-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel", cls: "mod-warning" });
    cancelBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });

    const applyBtn = buttonContainer.createEl("button", { text: "Apply changes", cls: "mod-cta" });
    applyBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }

  private renderFallbackDiff(container: HTMLElement) {
    const beforeLines = this.beforeYaml ? this.beforeYaml.split("\n") : [];
    const afterLines = this.afterYaml ? this.afterYaml.split("\n") : [];

    const removedLines = beforeLines.filter(line => !afterLines.includes(line));

    removedLines.forEach(line => {
      const lineEl = container.createDiv({ cls: "diff-line diff-removed" });
      lineEl.createSpan({ cls: "diff-prefix", text: "-" });
      lineEl.createSpan({ cls: "diff-content", text: line });
    });

    afterLines.forEach(line => {
      const isAdded = !beforeLines.includes(line);
      const cls = isAdded ? "diff-added" : "diff-unchanged";
      const prefix = isAdded ? "+" : " ";
      
      const lineEl = container.createDiv({ cls: "diff-line " + cls });
      lineEl.createSpan({ cls: "diff-prefix", text: prefix });
      lineEl.createSpan({ cls: "diff-content", text: line });
    });
  }

  onClose() {
    this.resolve(false);
    this.contentEl.empty();
  }

  private resolve(value: boolean) {
    if (!this.resolved && this.resolvePromise) {
      this.resolved = true;
      this.resolvePromise(value);
    }
  }

  waitForResult(): Promise<boolean> {
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
  diffStyle: DiffStyle
): Promise<boolean> {
  const beforeYaml = before ? frontmatterToYaml(before) : "";
  const afterYaml = frontmatterToYaml(after);

  console.log("[Auto Frontmatter] Diff modal - before:", beforeYaml);
  console.log("[Auto Frontmatter] Diff modal - after:", afterYaml);

  if (beforeYaml === afterYaml) {
    console.log("[Auto Frontmatter] No changes detected, skipping modal");
    return false;
  }

  const modal = new DiffModal(app, beforeYaml, afterYaml, diffStyle);
  modal.open();
  return modal.waitForResult();
}
