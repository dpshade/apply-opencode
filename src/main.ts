import { Notice, Plugin, MarkdownView, parseYaml, TFile } from "obsidian";
import { ApplyOpenCodeSettings, DEFAULT_SETTINGS, ApplyOpenCodeSettingTab, parsePropertyList } from "./settings";
import { parseFrontmatter, mergeFrontmatter, buildContent, orderFrontmatter, FrontmatterData } from "./frontmatter";
import { enhanceFrontmatter, enhanceFromTemplate, generateTitle, generateContent, reviseContent, reviseFrontmatter, identifyWikiLinks } from "./opencode";
import { showDiffModal } from "./diff-modal";
import { showContentDiffModal } from "./content-diff-modal";
import { findSimilarNotes, collectVaultTags, getAllNoteTitles } from "./vault-search";
import { showTitleConfirmModal } from "./title-confirm-modal";
import { loadTemplateSchemas, TemplateSchema } from "./template-schema";
import { TemplatePickerModal } from "./template-picker-modal";
import { showContentInputModal } from "./content-input-modal";
import { generateWikiLinks, validateWikiLinkChanges } from "./wiki-link-generator";
import { getSkillManager, SkillCache } from "./skills";
import { generateBase, editBase, validateBase, suggestBaseFilename } from "./base-generator";
import { generateCanvas, editCanvas, validateCanvas, suggestCanvasFilename } from "./canvas-generator";
import { showFileCreateModal } from "./file-create-modal";
import { collectVaultContext, extractKeywords } from "./vault-context";
import { collectWeeklyNotes, generateWeeklySummary } from "./weekly-summary";

interface PluginData {
  settings?: Partial<ApplyOpenCodeSettings>;
  skillCache?: SkillCache;
}

export default class ApplyOpenCodePlugin extends Plugin {
  settings: ApplyOpenCodeSettings;
  private skillManager = getSkillManager();

  async onload() {
    await this.loadSettings();

    // Initialize skill manager and check for updates silently
    void this.initializeSkills();

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

          // Revision callback for the diff modal
          const revisionCallback = async (currentYaml: string, instruction: string): Promise<string | null> => {
            return reviseFrontmatter({
              opencodePath: this.settings.opencodePath,
              model: this.settings.model,
              noteContent: content,
              currentYaml,
              instruction,
            });
          };

          console.debug("[Apply OpenCode] Opening diff modal");
          const result = await showDiffModal(this.app, existing, ordered, this.settings.diffStyle, revisionCallback);
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

          // Revision callback for the diff modal
          const revisionCallback = async (currentYaml: string, instruction: string): Promise<string | null> => {
            return reviseFrontmatter({
              opencodePath: this.settings.opencodePath,
              model: this.settings.model,
              noteContent: content,
              currentYaml,
              instruction,
            });
          };

          const result = await showDiffModal(this.app, existing, ordered, this.settings.diffStyle, revisionCallback);

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
      name: "Edit or append content at selection",
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

          // Build the proposed content with the generated text inserted/replaced
          const proposedContent = textBefore + generated + textAfter;
          
          // Revision callback for the diff modal
          const revisionCallback = async (currentContent: string, instruction: string): Promise<string | null> => {
            const revised = await reviseContent({
              opencodePath: this.settings.opencodePath,
              model: this.settings.model,
              title: file.basename,
              frontmatter,
              originalContent: content,
              currentContent,
              instruction,
            });
            return revised;
          };

          // Show diff modal for review
          const result = await showContentDiffModal(
            this.app,
            content,
            proposedContent,
            this.settings.diffStyle,
            hasSelection ? "Review generated replacement" : "Review generated content",
            revisionCallback
          );

          if (result === null) {
            new Notice("No changes to apply.", 5000);
          } else if (result.applied) {
            editor.setValue(result.modifiedContent);
            new Notice("Applied generated content", 5000);
          } else {
            new Notice("Changes discarded.", 5000);
          }
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

    // Create Base command
    this.addCommand({
      id: "create-base",
      name: "Create Obsidian base",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        const defaultFolder = activeFile?.parent?.path || "";

        const result = await showFileCreateModal(
          this.app,
          "base",
          suggestBaseFilename,
          defaultFolder
        );

        if (result.cancelled) {
          return;
        }

        const loadingNotice = new Notice("Generating base...", 0);

        try {
          const keywords = extractKeywords(result.description);
          const vaultContext = await collectVaultContext(this.app, undefined, {
            keywords,
            fileType: "base",
            maxExamples: 3,
          });
          const content = await generateBase(result.description, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            vaultContext,
          });

          loadingNotice.hide();

          // Validate the generated content
          const validation = validateBase(content);
          if (!validation.valid) {
            new Notice(`Generated Base is invalid: ${validation.error}`, 10000);
            console.error("[Apply OpenCode] Base validation failed:", validation.error);
            console.debug("[Apply OpenCode] Generated content:", content);
            return;
          }

          // Create the file
          const filename = result.filename.endsWith(".base")
            ? result.filename
            : `${result.filename}.base`;
          const filePath = result.folder
            ? `${result.folder}/${filename}`
            : filename;

          // Check if file already exists
          const existing = this.app.vault.getAbstractFileByPath(filePath);
          if (existing) {
            new Notice(`File already exists: ${filePath}`, 10000);
            return;
          }

          await this.app.vault.create(filePath, content);
          
          // Open the new file
          const newFile = this.app.vault.getAbstractFileByPath(filePath);
          if (newFile instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(newFile);
          }

          new Notice(`Created: ${filePath}`, 6000);
        } catch (err) {
          loadingNotice.hide();
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to create Base: ${message}`, 10000);
          console.error("[Apply OpenCode] Create Base error:", err);
        }
      },
    });

    // Edit Base command
    this.addCommand({
      id: "edit-base",
      name: "Edit current base",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "base") {
          return false;
        }
        if (checking) {
          return true;
        }
        void this.editCurrentBase(activeFile);
        return true;
      },
    });

    // Create Canvas command
    this.addCommand({
      id: "create-canvas",
      name: "Create canvas",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        const defaultFolder = activeFile?.parent?.path || "";

        const result = await showFileCreateModal(
          this.app,
          "canvas",
          suggestCanvasFilename,
          defaultFolder
        );

        if (result.cancelled) {
          return;
        }

        const loadingNotice = new Notice("Generating canvas...", 0);

        try {
          const keywords = extractKeywords(result.description);
          const vaultContext = await collectVaultContext(this.app, undefined, {
            keywords,
            fileType: "canvas",
            maxExamples: 2,
          });
          const content = await generateCanvas(result.description, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
            vaultContext,
          });

          loadingNotice.hide();

          // Validate the generated content
          const validation = validateCanvas(content);
          if (!validation.valid) {
            new Notice(`Generated Canvas is invalid: ${validation.error}`, 10000);
            console.error("[Apply OpenCode] Canvas validation failed:", validation.error);
            console.debug("[Apply OpenCode] Generated content:", content);
            return;
          }

          // Create the file
          const filename = result.filename.endsWith(".canvas")
            ? result.filename
            : `${result.filename}.canvas`;
          const filePath = result.folder
            ? `${result.folder}/${filename}`
            : filename;

          // Check if file already exists
          const existing = this.app.vault.getAbstractFileByPath(filePath);
          if (existing) {
            new Notice(`File already exists: ${filePath}`, 10000);
            return;
          }

          await this.app.vault.create(filePath, content);
          
          // Open the new file
          const newFile = this.app.vault.getAbstractFileByPath(filePath);
          if (newFile instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(newFile);
          }

          new Notice(`Created: ${filePath}`, 6000);
        } catch (err) {
          loadingNotice.hide();
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to create Canvas: ${message}`, 10000);
          console.error("[Apply OpenCode] Create Canvas error:", err);
        }
      },
    });

    // Edit Canvas command
    this.addCommand({
      id: "edit-canvas",
      name: "Edit current canvas",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "canvas") {
          return false;
        }
        if (checking) {
          return true;
        }
        void this.editCurrentCanvas(activeFile);
        return true;
      },
    });

    // Weekly Summary command
    this.addCommand({
      id: "this-weeks-summary",
      name: "This week's summary",
      callback: async () => {
        const loadingNotice = new Notice("Collecting this week's notes...", 0);

        try {
          const notes = await collectWeeklyNotes(this.app);
          
          if (notes.length === 0) {
            loadingNotice.hide();
            new Notice("No notes created or modified in the past 7 days.", 8000);
            return;
          }

          loadingNotice.setMessage(`Analyzing ${notes.length} notes...`);

          const summary = await generateWeeklySummary(notes, {
            opencodePath: this.settings.opencodePath,
            model: this.settings.model,
          });

          loadingNotice.hide();

          // Create a new note with the summary
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10);
          const filename = `Weekly Summary ${dateStr}.md`;
          
          // Check for existing file
          let filePath = filename;
          const existing = this.app.vault.getAbstractFileByPath(filePath);
          if (existing) {
            // Add timestamp to make unique
            const timestamp = today.toTimeString().slice(0, 5).replace(":", "");
            filePath = `Weekly Summary ${dateStr} ${timestamp}.md`;
          }

          const content = `---
title: Weekly Summary ${dateStr}
created: ${today.toISOString()}
tags: [weekly-summary]
---

# Weekly Summary: ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

${summary}
`;

          await this.app.vault.create(filePath, content);
          
          // Open the new file
          const newFile = this.app.vault.getAbstractFileByPath(filePath);
          if (newFile instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(newFile);
          }

          new Notice(`Created: ${filePath}`, 6000);
        } catch (err) {
          loadingNotice.hide();
          const message = err instanceof Error ? err.message : String(err);
          new Notice(`Failed to generate summary: ${message}`, 10000);
          console.error("[Apply OpenCode] Weekly summary error:", err);
        }
      },
    });

    this.addSettingTab(new ApplyOpenCodeSettingTab(this.app, this));
  }

  /**
   * Initialize skill manager and check for updates from GitHub
   */
  private async initializeSkills(): Promise<void> {
    try {
      await this.skillManager.checkForUpdates();
      // Save updated cache
      await this.saveSkillCache();
    } catch (err) {
      // Silent failure - skills will use embedded fallbacks
      console.debug("[Apply OpenCode] Skill update check failed:", err);
    }
  }

  /**
   * Save skill cache to plugin data
   */
  private async saveSkillCache(): Promise<void> {
    const data = await this.loadData() as PluginData | null;
    const newData: PluginData = {
      ...data,
      skillCache: this.skillManager.getCache(),
    };
    await this.saveData(newData);
  }

  /**
   * Edit the currently open .base file
   */
  private async editCurrentBase(file: TFile): Promise<void> {
    const inputResult = await showContentInputModal(this.app, false);
    if (inputResult.cancelled || !inputResult.instruction.trim()) {
      return;
    }

    let currentContent: string;
    try {
      currentContent = await this.app.vault.read(file);
    } catch {
      new Notice("Cannot read file content", 10000);
      return;
    }

    const loadingNotice = new Notice("Editing base...", 0);

    try {
      const keywords = extractKeywords(inputResult.instruction);
      const vaultContext = await collectVaultContext(this.app, file, {
        keywords,
        fileType: "base",
        maxExamples: 3,
      });
      const modified = await editBase(currentContent, inputResult.instruction, {
        opencodePath: this.settings.opencodePath,
        model: this.settings.model,
        vaultContext,
      });

      loadingNotice.hide();

      // Validate the modified content
      const validation = validateBase(modified);
      if (!validation.valid) {
        new Notice(`Modified Base is invalid: ${validation.error}`, 10000);
        console.error("[Apply OpenCode] Base validation failed:", validation.error);
        return;
      }

      // Show diff modal
      const result = await showContentDiffModal(
        this.app,
        currentContent,
        modified,
        this.settings.diffStyle,
        "Review base changes"
      );

      if (result === null) {
        new Notice("No changes to apply.", 5000);
      } else if (result.applied) {
        await this.app.vault.modify(file, result.modifiedContent);
        new Notice("Base updated.", 6000);
      } else {
        new Notice("Changes discarded.", 5000);
      }
    } catch (err) {
      loadingNotice.hide();
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to edit Base: ${message}`, 10000);
      console.error("[Apply OpenCode] Edit Base error:", err);
    }
  }

  /**
   * Edit the currently open .canvas file
   */
  private async editCurrentCanvas(file: TFile): Promise<void> {
    const inputResult = await showContentInputModal(this.app, false);
    if (inputResult.cancelled || !inputResult.instruction.trim()) {
      return;
    }

    let currentContent: string;
    try {
      currentContent = await this.app.vault.read(file);
    } catch {
      new Notice("Cannot read file content", 10000);
      return;
    }

    const loadingNotice = new Notice("Editing canvas...", 0);

    try {
      const keywords = extractKeywords(inputResult.instruction);
      const vaultContext = await collectVaultContext(this.app, file, {
        keywords,
        fileType: "canvas",
        maxExamples: 2,
      });
      const modified = await editCanvas(currentContent, inputResult.instruction, {
        opencodePath: this.settings.opencodePath,
        model: this.settings.model,
        vaultContext,
      });

      loadingNotice.hide();

      // Validate the modified content
      const validation = validateCanvas(modified);
      if (!validation.valid) {
        new Notice(`Modified Canvas is invalid: ${validation.error}`, 10000);
        console.error("[Apply OpenCode] Canvas validation failed:", validation.error);
        return;
      }

      // Show diff modal
      const result = await showContentDiffModal(
        this.app,
        currentContent,
        modified,
        this.settings.diffStyle,
        "Review canvas changes"
      );

      if (result === null) {
        new Notice("No changes to apply.", 5000);
      } else if (result.applied) {
        await this.app.vault.modify(file, result.modifiedContent);
        new Notice("Canvas updated.", 6000);
      } else {
        new Notice("Changes discarded.", 5000);
      }
    } catch (err) {
      loadingNotice.hide();
      const message = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to edit Canvas: ${message}`, 10000);
      console.error("[Apply OpenCode] Edit Canvas error:", err);
    }
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
    const data = await this.loadData() as PluginData | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    
    // Load skill cache
    if (data?.skillCache) {
      this.skillManager.loadCache(data.skillCache);
    }
  }

  async saveSettings() {
    const data: PluginData = {
      settings: this.settings,
      skillCache: this.skillManager.getCache(),
    };
    await this.saveData(data);
  }
}
