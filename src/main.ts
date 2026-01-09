import { Notice, Plugin, MarkdownView } from "obsidian";
import { AutoFrontmatterSettings, DEFAULT_SETTINGS, AutoFrontmatterSettingTab, parsePropertyList } from "./settings";
import { parseFrontmatter, mergeFrontmatter, buildContent } from "./frontmatter";
import { enhanceFrontmatter } from "./opencode";
import { showDiffModal } from "./diff-modal";
import { findSimilarNotes } from "./vault-search";

export default class AutoFrontmatterPlugin extends Plugin {
  settings: AutoFrontmatterSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "enhance-frontmatter",
      name: "Enhance frontmatter",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active markdown file.");
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.");
          return;
        }

        const content = editor.getValue();
        const { frontmatter: existing, body } = parseFrontmatter(content);

        new Notice("Finding similar notes...");
        console.log("[Auto Frontmatter] Starting enhancement");
        console.log("[Auto Frontmatter] Existing frontmatter:", existing);

        try {
          const examples = await findSimilarNotes(this.app, file, content, 5);
          console.log("[Auto Frontmatter] Found similar notes:", examples.length);

          new Notice("Enhancing frontmatter...");

          const enhanced = await enhanceFrontmatter(content, existing, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            customPrompt: this.settings.customPrompt,
            enhancedProperties: parsePropertyList(this.settings.enhancedProperties),
            ignoredProperties: parsePropertyList(this.settings.ignoredProperties),
            examples,
          });
          console.log("[Auto Frontmatter] Enhanced result:", enhanced);

          const merged = mergeFrontmatter(existing || {}, enhanced);
          console.log("[Auto Frontmatter] Merged result:", merged);

          console.log("[Auto Frontmatter] Opening diff modal");
          const confirmed = await showDiffModal(this.app, existing, merged, this.settings.diffStyle);
          console.log("[Auto Frontmatter] User confirmed:", confirmed);

          if (confirmed) {
            const newContent = buildContent(merged, body);
            editor.setValue(newContent);
            new Notice("Frontmatter updated.");
          } else {
            new Notice("Changes discarded.");
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to enhance frontmatter: ${message}`);
          console.error("[Auto Frontmatter] Error:", err);
        }
      },
    });

    this.addSettingTab(new AutoFrontmatterSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
