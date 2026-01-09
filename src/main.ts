import { Notice, Plugin, MarkdownView, parseYaml } from "obsidian";
import { ApplyOpenCodeSettings, DEFAULT_SETTINGS, ApplyOpenCodeSettingTab, parsePropertyList } from "./settings";
import { parseFrontmatter, mergeFrontmatter, buildContent, FrontmatterData } from "./frontmatter";
import { enhanceFrontmatter } from "./opencode";
import { showDiffModal } from "./diff-modal";
import { findSimilarNotes } from "./vault-search";

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

    this.addSettingTab(new ApplyOpenCodeSettingTab(this.app, this));
  }

  async loadSettings() {
    const data = await this.loadData() as Partial<ApplyOpenCodeSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
