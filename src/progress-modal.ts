import { App, Modal } from "obsidian";

export interface ProgressState {
  current: number;
  total: number;
  currentFile: string;
  successes: number;
  failures: number;
  cancelled: boolean;
}

export class ProgressModal extends Modal {
  private state: ProgressState;
  private progressBar: HTMLDivElement;
  private statusText: HTMLDivElement;
  private fileText: HTMLDivElement;
  private cancelBtn: HTMLButtonElement;
  private onCancel: () => void;

  constructor(app: App, total: number, onCancel: () => void) {
    super(app);
    this.state = {
      current: 0,
      total,
      currentFile: "",
      successes: 0,
      failures: 0,
      cancelled: false,
    };
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("apply-opencode-progress");

    contentEl.createEl("h3", { text: "Processing files..." });

    // Progress bar container
    const progressContainer = contentEl.createDiv({ cls: "progress-container" });
    this.progressBar = progressContainer.createDiv({ cls: "progress-bar" });
    this.progressBar.setCssProps({ width: "0%" });

    // Status text
    this.statusText = contentEl.createDiv({ cls: "progress-status" });
    this.updateStatusText();

    // Current file
    this.fileText = contentEl.createDiv({ cls: "progress-file" });

    // Cancel button
    const btnContainer = contentEl.createDiv({ cls: "progress-buttons" });
    this.cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
    this.cancelBtn.addEventListener("click", () => {
      this.state.cancelled = true;
      this.cancelBtn.disabled = true;
      this.cancelBtn.textContent = "Cancelling...";
      this.onCancel();
    });
  }

  update(current: number, currentFile: string, success: boolean | null) {
    this.state.current = current;
    this.state.currentFile = currentFile;
    if (success === true) this.state.successes++;
    if (success === false) this.state.failures++;

    const pct = Math.round((current / this.state.total) * 100);
    this.progressBar.setCssProps({ width: `${pct}%` });
    this.updateStatusText();
    this.fileText.textContent = currentFile;
  }

  private updateStatusText() {
    const { current, total, successes, failures } = this.state;
    this.statusText.textContent = `${current}/${total} — ${successes} done, ${failures} failed`;
  }

  complete() {
    this.cancelBtn.textContent = "Close";
    this.cancelBtn.disabled = false;
    this.cancelBtn.onclick = () => this.close();
    this.fileText.textContent = "Complete!";
  }

  isCancelled(): boolean {
    return this.state.cancelled;
  }

  getResults(): { successes: number; failures: number } {
    return { successes: this.state.successes, failures: this.state.failures };
  }
}
