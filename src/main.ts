import { Notice, Plugin, MarkdownView, parseYaml, TFile } from "obsidian";
import { ApplyOpenCodeSettings, DEFAULT_SETTINGS, ApplyOpenCodeSettingTab, parsePropertyList } from "./settings";
import { parseFrontmatter, mergeFrontmatter, buildContent, FrontmatterData } from "./frontmatter";
import { enhanceFrontmatter, generateTitle } from "./opencode";
import { showDiffModal } from "./diff-modal";
import { findSimilarNotes } from "./vault-search";
import { showTitleConfirmModal } from "./title-confirm-modal";

export default class ApplyOpenCodePlugin extends Plugin {
  settings: ApplyOpenCodeSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "enhance-frontmatter",
      name: "Enhance note frontmatter",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active Markdown file");
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.");
          return;
        }

        const content = editor.getValue();
        const { frontmatter: existing, body } = parseFrontmatter(content);

        console.log("[Apply OpenCode] Starting enhancement");
        console.log("[Apply OpenCode] Existing frontmatter:", existing);

        try {
          const examples = await findSimilarNotes(this.app, file, content, 5);
          console.log("[Apply OpenCode] Found similar notes:", examples.length);

          if (examples.length === 0) {
            new Notice("No similar notes found. Cannot determine valid properties.");
            return;
          }

          new Notice("Enhancing frontmatter...");

          const enhanceResult = await enhanceFrontmatter(content, existing, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            customPrompt: this.settings.customPrompt,
            ignoredProperties: parsePropertyList(this.settings.ignoredProperties),
            maxListItems: this.settings.maxListItems,
            examples,
          });
          console.log("[Apply OpenCode] Enhanced result:", enhanceResult);
          console.log("[Apply OpenCode] Valid properties:", enhanceResult.validProperties);

          const merged = mergeFrontmatter(existing || {}, enhanceResult.frontmatter);
          console.log("[Apply OpenCode] Merged result:", merged);

          console.log("[Apply OpenCode] Opening diff modal");
          const result = await showDiffModal(this.app, existing, merged, this.settings.diffStyle);
          console.log("[Apply OpenCode] Modal result:", result);

          if (result === null) {
            new Notice("No changes to apply.");
          } else if (result.applied) {
            // Parse the modified YAML back to an object
            const finalFrontmatter = parseYaml(result.modifiedYaml) as FrontmatterData | undefined;
            if (!finalFrontmatter) {
              new Notice("Failed to parse modified frontmatter.");
              return;
            }
            const newContent = buildContent(finalFrontmatter, body);
            editor.setValue(newContent);
            new Notice("Frontmatter updated.");
          } else {
            new Notice("Changes discarded.");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to enhance frontmatter: ${message}`);
          console.error("[Apply OpenCode] Error:", err);
        }
      },
    });

    // Title generation command
    this.addCommand({
      id: "generate-title",
      name: "Generate AI title for current file",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("No active file to rename");
          return;
        }
        await this.generateTitleForFile(activeFile);
      },
    });

    // Ribbon icon for title generation
    this.addRibbonIcon("brain-circuit", "Enhance title with AI", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file to rename");
        return;
      }
      await this.generateTitleForFile(activeFile);
    });

    this.addSettingTab(new ApplyOpenCodeSettingTab(this.app, this));
  }

  async generateTitleForFile(file: TFile): Promise<boolean> {
    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch {
      new Notice("Cannot read file content - may be a binary file");
      return false;
    }

    if (content.trim().length < 10) {
      new Notice("File content is too short to generate a meaningful title");
      return false;
    }

    if (content.length > 100000) {
      new Notice("File is too large for title generation");
      return false;
    }

    const loadingNotice = new Notice("Generating title...", 0);

    let title: string | null = null;
    try {
      title = await generateTitle(content, {
        opencodePath: this.settings.opencodePath,
        model: this.settings.model,
      });
    } finally {
      loadingNotice.hide();
    }

    if (!title) {
      new Notice("Failed to generate title");
      return false;
    }

    // Optional confirmation modal
    if (this.settings.confirmTitleRename) {
      const result = await showTitleConfirmModal(this.app, title, file.basename);
      if (!result.confirmed) {
        new Notice("Rename cancelled");
        return false;
      }
      title = result.title;
    }

    // Rename file
    const dir = file.parent?.path || "";
    const extension = file.extension;
    const newPath = dir ? `${dir}/${title}.${extension}` : `${title}.${extension}`;

    const existingFile = this.app.vault.getAbstractFileByPath(newPath);
    if (existingFile && existingFile !== file) {
      new Notice(`File "${title}.${extension}" already exists`);
      return false;
    }

    await this.app.fileManager.renameFile(file, newPath);
    new Notice(`Renamed to: ${title}.${extension}`);
    return true;
  }

  async enhanceFrontmatterForFile(file: TFile): Promise<boolean> {
    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch {
      console.error(`[Apply OpenCode] Cannot read file: ${file.path}`);
      return false;
    }

    const { frontmatter: existing, body } = parseFrontmatter(content);

    try {
      const examples = await findSimilarNotes(this.app, file, content, 5);
      if (examples.length === 0) {
        console.log(`[Apply OpenCode] No similar notes found for ${file.path}`);
        return false;
      }

      const enhanceResult = await enhanceFrontmatter(content, existing, {
        opencodePath: this.settings.opencodePath,
        model: this.settings.model,
        customPrompt: this.settings.customPrompt,
        ignoredProperties: parsePropertyList(this.settings.ignoredProperties),
        maxListItems: this.settings.maxListItems,
        examples,
      });

      const merged = mergeFrontmatter(existing || {}, enhanceResult.frontmatter);
      
      // For bulk operations, apply directly without diff modal
      const newContent = buildContent(merged, body);
      await this.app.vault.modify(file, newContent);
      return true;
    } catch (err) {
      console.error(`[Apply OpenCode] Failed to enhance ${file.path}:`, err);
      return false;
    }
  }

  async loadSettings() {
    const data = await this.loadData() as Partial<ApplyOpenCodeSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
