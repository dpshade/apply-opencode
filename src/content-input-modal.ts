import { App, Modal } from "obsidian";

export interface ContentInputResult {
  instruction: string;
  cancelled: boolean;
}

export class ContentInputModal extends Modal {
  private instruction = "";
  private resolve: (result: ContentInputResult) => void;
  private hasSelection: boolean;
  private resolved = false;

  constructor(app: App, resolve: (result: ContentInputResult) => void, hasSelection = false) {
    super(app);
    this.resolve = resolve;
    this.hasSelection = hasSelection;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    // Add custom class for styling
    modalEl.addClass("apply-opencode-content-input");

    // Create search-bar style input container
    const inputContainer = contentEl.createDiv({ cls: "content-input-container" });

    const input = inputContainer.createEl("input", {
      type: "text",
      cls: "content-input-field",
      placeholder: this.hasSelection
        ? "Describe replacement (optional)..."
        : "Describe what to generate (optional)...",
    });

    input.addEventListener("input", (e) => {
      this.instruction = (e.target as HTMLInputElement).value;
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancel();
      }
    });

    // Hint text
    const hint = contentEl.createDiv({ cls: "content-input-hint" });
    hint.setText("Press enter to generate, esc to cancel");

    // Focus input
    setTimeout(() => input.focus(), 10);
  }

  private submit() {
    this.resolved = true;
    this.resolve({ instruction: this.instruction, cancelled: false });
    this.close();
  }

  private cancel() {
    this.resolved = true;
    this.resolve({ instruction: "", cancelled: true });
    this.close();
  }

  onClose() {
    const { contentEl, modalEl } = this;
    modalEl.removeClass("apply-opencode-content-input");
    contentEl.empty();
    // Resolve if closed via background click or other means
    if (!this.resolved) {
      this.resolve({ instruction: "", cancelled: true });
    }
  }
}

export function showContentInputModal(app: App, hasSelection = false): Promise<ContentInputResult> {
  return new Promise((resolve) => {
    const modal = new ContentInputModal(app, resolve, hasSelection);
    modal.open();
  });
}
