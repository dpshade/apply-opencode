import { App, SuggestModal } from "obsidian";
import { TemplateSchema } from "./template-schema";

export class TemplatePickerModal extends SuggestModal<TemplateSchema> {
  private templates: TemplateSchema[];
  private resolve: (value: TemplateSchema | null) => void;
  private resolved = false;

  constructor(app: App, templates: TemplateSchema[], resolve: (value: TemplateSchema | null) => void) {
    super(app);
    this.setPlaceholder("Select a template...");
    this.templates = templates;
    this.resolve = resolve;
  }

  getSuggestions(query: string): TemplateSchema[] {
    if (!query || query.trim() === "") {
      return this.templates;
    }
    const q = query.toLowerCase();
    return this.templates.filter((t) => {
      const path = t.templatePath.toLowerCase();
      return path.includes(q);
    });
  }

  renderSuggestion(schema: TemplateSchema, el: HTMLElement) {
    const container = el.createDiv({ cls: "template-suggestion" });

    const nameEl = container.createDiv({ cls: "template-name" });
    nameEl.textContent = schema.templatePath.split("/").pop() || schema.templatePath;

    const pathEl = container.createDiv({ cls: "template-path" });
    pathEl.textContent = schema.templatePath;

    const propsEl = container.createDiv({ cls: "template-props" });
    propsEl.textContent = `${schema.properties.length} properties`;
  }

  onOpen(): void {
    void super.onOpen();
    this.inputEl.focus();
    // Select first suggestion after a brief delay to ensure suggestions are rendered
    setTimeout(() => {
      const firstSuggestion = this.resultContainerEl.querySelector(".suggestion-item");
      if (firstSuggestion) {
        firstSuggestion.addClass("is-selected");
      }
    }, 10);
  }

  selectSuggestion(value: TemplateSchema, evt: MouseEvent | KeyboardEvent): void {
    // This is called when user clicks or presses Enter on a suggestion
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(value);
    }
    this.close();
  }

  onChooseSuggestion(schema: TemplateSchema): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(schema);
    }
  }

  onClose(): void {
    super.onClose();
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(null);
    }
  }
}
