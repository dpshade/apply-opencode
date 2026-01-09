import { Notice, Plugin, MarkdownView, parseYaml, TFile } from "obsidian";
import { ApplyOpenCodeSettings, DEFAULT_SETTINGS, ApplyOpenCodeSettingTab, parsePropertyList } from "./settings";
import { parseFrontmatter, mergeFrontmatter, buildContent, orderFrontmatter, FrontmatterData } from "./frontmatter";
import { enhanceFrontmatter, enhanceFromTemplate, generateTitle, generateContent, identifyWikiLinks } from "./opencode";
import { showDiffModal } from "./diff-modal";
import { showContentDiffModal } from "./content-diff-modal";
import { findSimilarNotes, collectVaultTags, getAllNoteTitles } from "./vault-search";
import { showTitleConfirmModal } from "./title-confirm-modal";
import { loadTemplateSchemas, TemplateSchema } from "./template-schema";
import { TemplatePickerModal } from "./template-picker-modal";
import { showContentInputModal } from "./content-input-modal";
import { generateWikiLinks, validateWikiLinkChanges } from "./wiki-link-generator";

export default class ApplyOpenCodePlugin extends Plugin {
  settings: ApplyOpenCodeSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "enhance-frontmatter",
      name: "Enhance note frontmatter",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active Markdown file", 8000);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.", 8000);
          return;
        }

        const content = editor.getValue();
        const { frontmatter: existing, body } = parseFrontmatter(content);

        console.debug("[Apply OpenCode] Starting enhancement");
        console.debug("[Apply OpenCode] Existing frontmatter:", existing);

        try {
          const examples = await findSimilarNotes(this.app, file, content, 5);
          console.debug("[Apply OpenCode] Found similar notes:", examples.length);

          if (examples.length === 0) {
            new Notice("No similar notes found. Cannot determine valid properties.", 10000);
            return;
          }

          new Notice("Enhancing frontmatter...", 0);

          const vaultTags = collectVaultTags(this.app);
          const allTitles = this.settings.noteSearchMode === "semantic"
            ? getAllNoteTitles(this.app, file)
            : undefined;

          const enhanceResult = await enhanceFrontmatter(content, existing, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            customPrompt: this.settings.customPrompt,
            ignoredProperties: parsePropertyList(this.settings.ignoredProperties),
            maxListItems: this.settings.maxListItems,
            examples,
            vaultTags,
            allTitles,
          });
          console.debug("[Apply OpenCode] Enhanced result:", enhanceResult);
          console.debug("[Apply OpenCode] Valid properties:", enhanceResult.validProperties);

          const merged = mergeFrontmatter(existing || {}, enhanceResult.frontmatter);
          const ordered = orderFrontmatter(merged, enhanceResult.propertyOrder);
          console.debug("[Apply OpenCode] Merged and ordered result:", ordered);

          console.debug("[Apply OpenCode] Opening diff modal");
          const result = await showDiffModal(this.app, existing, ordered, this.settings.diffStyle);
          console.debug("[Apply OpenCode] Modal result:", result);

          if (result === null) {
            new Notice("No changes to apply.", 5000);
          } else if (result.applied) {
            // Parse the modified YAML back to an object
            const finalFrontmatter = parseYaml(result.modifiedYaml) as FrontmatterData | undefined;
            if (!finalFrontmatter) {
              new Notice("Failed to parse modified frontmatter.", 10000);
              return;
            }
            const newContent = buildContent(finalFrontmatter, body);
            editor.setValue(newContent);
            new Notice("Frontmatter updated.", 6000);
          } else {
            new Notice("Changes discarded.", 5000);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to enhance frontmatter: ${message}`);
          console.error("[Apply OpenCode] Error:", err);
        }
      },
    });

    // Template-based enhancement command
    this.addCommand({
      id: "use-template-frontmatter",
      name: "Use template for frontmatter",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active Markdown file", 8000);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.", 8000);
          return;
        }

        const content = editor.getValue();
        const { frontmatter: existing, body } = parseFrontmatter(content);

        try {
          const templates = await loadTemplateSchemas(this.app);
          if (templates.length === 0) {
            new Notice("No template files found. Create a template in a templates folder.", 10000);
            return;
          }

          // Show template picker
          const template = await new Promise<TemplateSchema | null>((resolve) => {
            const modal = new TemplatePickerModal(this.app, templates, resolve);
            modal.open();
          });

          if (!template) {
            new Notice("Template selection cancelled.", 5000);
            return;
          }

          const processingNotice = new Notice(`Using template: ${template.templatePath}`, 0);

          // Enhance using template properties only
          const enhanceResult = await enhanceFromTemplate(content, existing, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            customPrompt: this.settings.customPrompt,
            templateSchema: template,
          });

          processingNotice.hide();

          const merged = mergeFrontmatter(existing || {}, enhanceResult.frontmatter);
          const ordered = orderFrontmatter(merged, enhanceResult.propertyOrder);

          const result = await showDiffModal(this.app, existing, ordered, this.settings.diffStyle);

          if (result === null) {
            new Notice("No changes to apply.", 5000);
          } else if (result.applied) {
            const finalFrontmatter = parseYaml(result.modifiedYaml) as FrontmatterData | undefined;
            if (!finalFrontmatter) {
              new Notice("Failed to parse modified frontmatter.", 10000);
              return;
            }
            const newContent = buildContent(finalFrontmatter, body);
            editor.setValue(newContent);
            new Notice("Frontmatter updated from template.", 6000);
          } else {
            new Notice("Changes discarded.", 5000);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to use template: ${message}`, 10000);
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
          new Notice("No active file to rename", 8000);
          return;
        }
        await this.generateTitleForFile(activeFile);
      },
    });

    // Content generation command
    this.addCommand({
      id: "generate-content",
      name: "Generate content at cursor",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active Markdown file", 8000);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.", 8000);
          return;
        }

        // Check if there's a selection
        const selection = editor.getSelection();
        const hasSelection = selection.length > 0;

        // Get optional instruction from user
        const inputResult = await showContentInputModal(this.app, hasSelection);
        if (inputResult.cancelled) {
          return;
        }

        const content = editor.getValue();
        const { frontmatter } = parseFrontmatter(content);

        let textBefore: string;
        let textAfter: string;
        let selectedText: string | undefined;

        if (hasSelection) {
          // Selection mode: replace selected text
          const from = editor.getCursor("from");
          const to = editor.getCursor("to");
          const fromOffset = editor.posToOffset(from);
          const toOffset = editor.posToOffset(to);

          textBefore = content.slice(0, fromOffset);
          textAfter = content.slice(toOffset);
          selectedText = selection;
        } else {
          // Cursor mode: insert at cursor
          const cursor = editor.getCursor();
          const offset = editor.posToOffset(cursor);
          textBefore = content.slice(0, offset);
          textAfter = content.slice(offset);
        }

        const loadingNotice = new Notice(hasSelection ? "Generating replacement..." : "Generating content...", 0);

        try {
          const generated = await generateContent({
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            title: file.basename,
            frontmatter,
            textBefore,
            textAfter,
            instruction: inputResult.instruction || undefined,
            selectedText,
          });

          loadingNotice.hide();

          if (!generated) {
            new Notice("Failed to generate content", 10000);
            return;
          }

          if (hasSelection) {
            // Replace selection
            editor.replaceSelection(generated);
          } else {
            // Insert at cursor position
            editor.replaceRange(generated, editor.getCursor());
          }
          new Notice(`Generated ${generated.length} characters`, 5000);
        } catch (err) {
          loadingNotice.hide();
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to generate content: ${message}`, 10000);
          console.error("[Apply OpenCode] Content generation error:", err);
        }
      },
    });

    // Wiki link identification command
    this.addCommand({
      id: "identify-wiki-links",
      name: "Identify and add wiki links",
      editorCallback: async (editor, view) => {
        if (!(view instanceof MarkdownView)) {
          new Notice("No active Markdown file", 8000);
          return;
        }

        const file = view.file;
        if (!file) {
          new Notice("No file open.", 8000);
          return;
        }

        // Get content - use selection if present, otherwise full content
        const selection = editor.getSelection();
        const hasSelection = selection.length > 0;
        const contentToProcess = hasSelection ? selection : editor.getValue();

        const loadingNotice = new Notice("Identifying wiki links...", 0);

        try {
          const existingTitles = getAllNoteTitles(this.app, file);

          // Create the entity identifier function that calls OpenCode
          const identifyEntities = async (content: string) => {
            const spans = await identifyWikiLinks(content, {
              opencodePath: this.settings.opencodePath,
              model: this.settings.model,
              existingTitles,
            });
            return spans;
          };

          const modified = await generateWikiLinks({
            content: contentToProcess,
            existingTitles,
            strategy: this.settings.wikiLinkStrategy,
            mode: this.settings.wikiLinkMode,
            identifyEntities,
          });

          loadingNotice.hide();

          // Validate that only brackets were added
          if (!validateWikiLinkChanges(contentToProcess, modified)) {
            new Notice("Wiki link generation failed validation - content was modified beyond adding brackets", 10000);
            console.error("[Apply OpenCode] Wiki link validation failed");
            return;
          }

          // Show diff modal
          const result = await showContentDiffModal(
            this.app,
            contentToProcess,
            modified,
            this.settings.diffStyle,
            "Review wiki link changes"
          );

          if (result === null) {
            new Notice("No wiki links to add.", 5000);
          } else if (result.applied) {
            // Final validation on the potentially user-modified content
            if (!validateWikiLinkChanges(contentToProcess, result.modifiedContent)) {
              new Notice("Changes rejected - content was modified beyond adding brackets", 10000);
              return;
            }

            if (hasSelection) {
              editor.replaceSelection(result.modifiedContent);
            } else {
              editor.setValue(result.modifiedContent);
            }
            new Notice("Wiki links added.", 6000);
          } else {
            new Notice("Changes discarded.", 5000);
          }
        } catch (err) {
          loadingNotice.hide();
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to identify wiki links: ${message}`, 10000);
          console.error("[Apply OpenCode] Wiki link error:", err);
        }
      },
    });

    // Ribbon icon for title generation
    this.addRibbonIcon("brain-circuit", "Enhance title with AI", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file to rename", 8000);
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
      new Notice("Cannot read file content - may be a binary file", 10000);
      return false;
    }

    if (content.trim().length < 10) {
      new Notice("File content is too short to generate a meaningful title", 8000);
      return false;
    }

    if (content.length > 100000) {
      new Notice("File is too large for title generation", 8000);
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
      new Notice("Failed to generate title", 10000);
      return false;
    }

    // Optional confirmation modal
    if (this.settings.confirmTitleRename) {
      const result = await showTitleConfirmModal(this.app, title, file.basename);
      if (!result.confirmed) {
        new Notice("Rename cancelled", 5000);
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
    new Notice(`Renamed to: ${title}.${extension}`, 8000);
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
        console.debug(`[Apply OpenCode] No similar notes found for ${file.path}`);
        return false;
      }

      const vaultTags = collectVaultTags(this.app);
      const allTitles = this.settings.noteSearchMode === "semantic"
        ? getAllNoteTitles(this.app, file)
        : undefined;

      const enhanceResult = await enhanceFrontmatter(content, existing, {
        opencodePath: this.settings.opencodePath,
        model: this.settings.model,
        customPrompt: this.settings.customPrompt,
        ignoredProperties: parsePropertyList(this.settings.ignoredProperties),
        maxListItems: this.settings.maxListItems,
        examples,
        vaultTags,
        allTitles,
      });

      const merged = mergeFrontmatter(existing || {}, enhanceResult.frontmatter);
      const ordered = orderFrontmatter(merged, enhanceResult.propertyOrder);

      // For bulk operations, apply directly without diff modal
      const newContent = buildContent(ordered, body);
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
