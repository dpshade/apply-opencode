import { App, Modal, Setting } from "obsidian";

export interface TitleConfirmResult {
  confirmed: boolean;
  title: string;
}

export class TitleConfirmModal extends Modal {
  private result: TitleConfirmResult;
  private resolvePromise: (result: TitleConfirmResult) => void;
  private originalTitle: string;

  constructor(app: App, suggestedTitle: string, private currentName: string) {
    super(app);
    this.originalTitle = suggestedTitle;
    this.result = { confirmed: false, title: suggestedTitle };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Rename file" });
    contentEl.createEl("p", {
      text: `Current name: ${this.currentName}`,
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .setName("New title")
      .setDesc("Edit the AI-suggested title if needed")
      .addText((text) =>
        text
          .setValue(this.result.title)
          .onChange((value) => {
            this.result.title = value;
          })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => {
            this.result.confirmed = false;
            this.close();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Rename")
          .setCta()
          .onClick(() => {
            this.result.confirmed = true;
            this.close();
          })
      );
  }

  onClose() {
    this.resolvePromise(this.result);
  }

  waitForResult(): Promise<TitleConfirmResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export async function showTitleConfirmModal(
  app: App,
  suggestedTitle: string,
  currentName: string
): Promise<TitleConfirmResult> {
  const modal = new TitleConfirmModal(app, suggestedTitle, currentName);
  modal.open();
  return modal.waitForResult();
}
