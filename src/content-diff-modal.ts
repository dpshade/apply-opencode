import { App, Modal } from "obsidian";
import { preloadDiffHTML } from "@pierre/diffs/ssr";
import { DiffStyle } from "./settings";

export interface ContentDiffModalResult {
  applied: boolean;
  modifiedContent: string;
}

export type RevisionCallback = (currentContent: string, instruction: string) => Promise<string | null>;

export class ContentDiffModal extends Modal {
  private beforeContent: string;
  private afterContent: string;
  private modifiedContent: string;
  private diffStyle: DiffStyle;
  private title: string;
  private diffContainer: HTMLElement | null = null;
  private revisionInput: HTMLTextAreaElement | null = null;
  private revisionCallback: RevisionCallback | null = null;
  private resolvePromise: ((value: ContentDiffModalResult) => void) | null = null;
  private resolved = false;

  constructor(
    app: App,
    beforeContent: string,
    afterContent: string,
    diffStyle: DiffStyle,
    title = "Review content changes",
    revisionCallback?: RevisionCallback,
  ) {
    super(app);
    this.beforeContent = beforeContent;
    this.afterContent = afterContent;
    this.modifiedContent = afterContent;
    this.diffStyle = diffStyle;
    this.title = title;
    this.revisionCallback = revisionCallback || null;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("apply-opencode-diff-modal");

    contentEl.createEl("h2", { text: this.title });

    this.diffContainer = contentEl.createDiv({ cls: "diff-container" });
    await this.renderDiff();

    // Revision input (only if callback provided)
    if (this.revisionCallback) {
      const revisionContainer = contentEl.createDiv({ cls: "revision-container" });
      this.revisionInput = revisionContainer.createEl("textarea", {
        cls: "revision-input",
        attr: { placeholder: "Request revision (e.g., 'make it shorter', 'more formal tone')..." },
      });
      
      const reviseBtn = revisionContainer.createEl("button", {
        text: "Revise",
        cls: "revision-btn",
      });
      reviseBtn.addEventListener("click", () => void this.handleRevision());
    }

    const buttonContainer = contentEl.createDiv({ cls: "diff-buttons" });

    const cancelBtn = buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "aoc-btn aoc-btn-secondary",
    });
    cancelBtn.addEventListener("click", () => {
      this.resolve({ applied: false, modifiedContent: this.modifiedContent });
      this.close();
    });

    const applyBtn = buttonContainer.createEl("button", {
      text: "Apply changes",
      cls: "aoc-btn aoc-btn-primary",
    });
    applyBtn.addEventListener("click", () => {
      this.resolve({ applied: true, modifiedContent: this.modifiedContent });
      this.close();
    });
  }

  private async handleRevision() {
    if (!this.revisionCallback || !this.revisionInput) return;
    
    const instruction = this.revisionInput.value.trim();
    if (!instruction) return;

    // Disable input during revision
    this.revisionInput.disabled = true;
    const originalPlaceholder = this.revisionInput.placeholder;
    this.revisionInput.placeholder = "Revising...";

    try {
      const revised = await this.revisionCallback(this.modifiedContent, instruction);
      if (revised) {
        this.modifiedContent = revised;
        await this.renderDiff();
        this.revisionInput.value = "";
      }
    } finally {
      this.revisionInput.disabled = false;
      this.revisionInput.placeholder = originalPlaceholder;
    }
  }

  private async renderDiff() {
    if (!this.diffContainer) return;
    this.diffContainer.empty();

    try {
      const diffHtml = await preloadDiffHTML({
        oldFile: {
          name: "before",
          contents: this.beforeContent || "",
          lang: "markdown",
        },
        newFile: {
          name: "after",
          contents: this.modifiedContent || "",
          lang: "markdown",
        },
        options: {
          diffStyle: this.diffStyle,
          diffIndicators: "classic",
          lineDiffType: "word",
          disableLineNumbers: false,
          disableFileHeader: true,
          overflow: "wrap",
        },
      });

      // Safely parse and append HTML using DOMParser
      const diffWrapper = this.diffContainer.createDiv();
      const parser = new DOMParser();
      const doc = parser.parseFromString(diffHtml, "text/html");
      while (doc.body.firstChild) {
        diffWrapper.appendChild(doc.body.firstChild);
      }
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
        void this.revertLine(lineContent);
      });
    });
  }

  /**
   * Reverts a changed line back to its original content by finding the
   * corresponding line in the before content.
   */
  private async revertLine(addedContent: string) {
    const modifiedLines = this.modifiedContent.split("\n");
    const beforeLines = this.beforeContent.split("\n");

    const modifiedIndex = modifiedLines.findIndex((line) => line === addedContent);
    if (modifiedIndex === -1) return;

    // Find the original line at this position
    if (modifiedIndex < beforeLines.length) {
      modifiedLines[modifiedIndex] = beforeLines[modifiedIndex];
    }

    this.modifiedContent = modifiedLines.join("\n");
    await this.renderDiff();
  }

  private renderFallbackDiff(container: HTMLElement) {
    const beforeLines = this.beforeContent ? this.beforeContent.split("\n") : [];
    const afterLines = this.afterContent ? this.afterContent.split("\n") : [];

    // Simple line-by-line comparison for fallback
    const maxLines = Math.max(beforeLines.length, afterLines.length);

    for (let i = 0; i < maxLines; i++) {
      const beforeLine = beforeLines[i] ?? "";
      const afterLine = afterLines[i] ?? "";

      if (beforeLine !== afterLine) {
        if (beforeLine) {
          const removedEl = container.createDiv({ cls: "diff-line diff-removed" });
          removedEl.createSpan({ cls: "diff-prefix", text: "-" });
          removedEl.createSpan({ cls: "diff-content", text: beforeLine });
        }
        if (afterLine) {
          const addedEl = container.createDiv({ cls: "diff-line diff-added" });
          addedEl.createSpan({ cls: "diff-prefix", text: "+" });
          addedEl.createSpan({ cls: "diff-content", text: afterLine });
        }
      } else {
        const unchangedEl = container.createDiv({ cls: "diff-line diff-unchanged" });
        unchangedEl.createSpan({ cls: "diff-prefix", text: " " });
        unchangedEl.createSpan({ cls: "diff-content", text: afterLine });
      }
    }
  }

  onClose() {
    this.resolve({ applied: false, modifiedContent: this.modifiedContent });
    this.contentEl.empty();
  }

  private resolve(value: ContentDiffModalResult) {
    if (!this.resolved && this.resolvePromise) {
      this.resolved = true;
      this.resolvePromise(value);
    }
  }

  waitForResult(): Promise<ContentDiffModalResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export async function showContentDiffModal(
  app: App,
  before: string,
  after: string,
  diffStyle: DiffStyle,
  title = "Review content changes",
  revisionCallback?: RevisionCallback,
): Promise<ContentDiffModalResult | null> {
  if (before === after) {
    console.debug("[Apply OpenCode] No changes detected, skipping modal");
    return null;
  }

  const modal = new ContentDiffModal(app, before, after, diffStyle, title, revisionCallback);
  modal.open();
  return modal.waitForResult();
}
