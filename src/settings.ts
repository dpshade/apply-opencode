import { App, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import { spawn } from "child_process";
import ApplyOpenCodePlugin from "./main";
import { ProgressModal } from "./progress-modal";

export type DiffStyle = "split" | "unified";

export interface ApplyOpenCodeSettings {
  model: string;
  opencodePath: string;
  customPrompt: string;
  ignoredProperties: string;
  diffStyle: DiffStyle;
  maxListItems: number;
  confirmTitleRename: boolean;
}

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";

export const DEFAULT_SETTINGS: ApplyOpenCodeSettings = {
  model: "opencode/claude-sonnet-4-5",
  opencodePath: DEFAULT_OPENCODE_PATH,
  customPrompt: "",
  ignoredProperties: "created, modified, uid",
  diffStyle: "split",
  maxListItems: 3,
  confirmTitleRename: false,
};

export function parsePropertyList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function fetchAvailableModels(opencodePath: string): Promise<string[]> {
  const pathsToTry = [opencodePath, DEFAULT_OPENCODE_PATH, "opencode"];

  for (const path of pathsToTry) {
    try {
      const models = await tryFetchModels(path);
      if (models.length > 0) return models;
    } catch {
      continue;
    }
  }
  return [];
}

function tryFetchModels(opencodePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(opencodePath, ["models"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.opencode/bin` },
    });
    let stdout = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const models = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        resolve(models);
      } else {
        reject(new Error(`Exit code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

export class ApplyOpenCodeSettingTab extends PluginSettingTab {
  plugin: ApplyOpenCodePlugin;

  constructor(app: App, plugin: ApplyOpenCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Fetch models async and update dropdown when ready
    void this.displayWithModels(containerEl);
  }

  private async displayWithModels(containerEl: HTMLElement): Promise<void> {
    const models = await fetchAvailableModels(this.plugin.settings.opencodePath);

    const modelSetting = new Setting(containerEl)
      .setName("Model")
      .setDesc("Model to use for frontmatter enhancement.");

    if (models.length > 0) {
      modelSetting.addDropdown((dropdown) => {
        for (const model of models) {
          dropdown.addOption(model, model);
        }
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        });
      });
    } else {
      modelSetting
        .setDesc("Model (could not fetch model list - enter manually).")
        .addText((text) =>
          text
            .setPlaceholder("Model ID")
            .setValue(this.plugin.settings.model)
            .onChange(async (value) => {
              this.plugin.settings.model = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("Executable path")
      .setDesc("Path to the opencode executable.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_OPENCODE_PATH)
          .setValue(this.plugin.settings.opencodePath)
          .onChange(async (value) => {
            this.plugin.settings.opencodePath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Diff view style")
      .setDesc("Side-by-side (split) or vertical (unified) diff view.")
      .addDropdown((dropdown) => {
        dropdown.addOption("split", "Side by side");
        dropdown.addOption("unified", "Unified (vertical)");
        dropdown.setValue(this.plugin.settings.diffStyle);
        dropdown.onChange(async (value) => {
          this.plugin.settings.diffStyle = value as DiffStyle;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Max list items")
      .setDesc("Maximum items for array properties (tags, etc). Only exceed if truly exceptional.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.maxListItems)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxListItems = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ignored properties")
      .setDesc("Comma-separated list of frontmatter properties the AI should never modify.")
      .addText((text) =>
        text
          .setPlaceholder("Property names")
          .setValue(this.plugin.settings.ignoredProperties)
          .onChange(async (value) => {
            this.plugin.settings.ignoredProperties = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Custom prompt")
      .setDesc("Additional instructions for frontmatter enhancement (optional).")
      .addTextArea((text) =>
        text
          .setPlaceholder("Focus on extracting technical concepts...")
          .setValue(this.plugin.settings.customPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Title generation").setHeading();

    new Setting(containerEl)
      .setName("Confirm before rename")
      .setDesc("Show a confirmation modal before renaming files with AI-generated titles.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.confirmTitleRename)
          .onChange(async (value) => {
            this.plugin.settings.confirmTitleRename = value;
            await this.plugin.saveSettings();
          })
      );

    // Bulk rename section
    const untitledFiles = this.getUntitledFiles();
    const bulkSetting = new Setting(containerEl)
      .setName("Bulk rename untitled files")
      .setDesc(`Found ${untitledFiles.length} file(s) with "Untitled" in the name.`);

    if (untitledFiles.length > 0) {
      bulkSetting.addButton((btn) =>
        btn
          .setButtonText(`Rename all ${untitledFiles.length} files`)
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("Renaming...");
            await this.bulkRenameUntitled(untitledFiles);
            // Refresh the settings display
            this.display();
          })
      );
    }

    // Bulk enhance frontmatter section
    const noFrontmatterFiles = this.getFilesWithoutFrontmatter();
    const bulkFrontmatterSetting = new Setting(containerEl)
      .setName("Bulk enhance frontmatter")
      .setDesc(`Found ${noFrontmatterFiles.length} file(s) with no frontmatter.`);

    if (noFrontmatterFiles.length > 0) {
      bulkFrontmatterSetting.addButton((btn) =>
        btn
          .setButtonText(`Enhance all ${noFrontmatterFiles.length} files`)
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("Enhancing...");
            await this.bulkEnhanceFrontmatter(noFrontmatterFiles);
            this.display();
          })
      );
    }
  }

  private getUntitledFiles(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.basename.toLowerCase().includes("untitled"));
  }

  private getFilesWithoutFrontmatter(): TFile[] {
    const files: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        files.push(file);
      }
    }
    return files;
  }

  private async bulkRenameUntitled(files: TFile[]): Promise<void> {
    let cancelled = false;
    const progress = new ProgressModal(this.app, files.length, () => {
      cancelled = true;
    });
    progress.open();

    for (let i = 0; i < files.length; i++) {
      if (cancelled) break;

      const file = files[i];
      progress.update(i, file.path, null);

      try {
        const success = await this.plugin.generateTitleForFile(file);
        progress.update(i + 1, file.path, success);
      } catch (err) {
        console.error(`[Apply OpenCode] Failed to rename ${file.path}:`, err);
        progress.update(i + 1, file.path, false);
      }
    }

    progress.complete();
    const { successes, failures } = progress.getResults();
    new Notice(`Bulk rename: ${successes} renamed, ${failures} failed${cancelled ? " (cancelled)" : ""}`);
  }

  private async bulkEnhanceFrontmatter(files: TFile[]): Promise<void> {
    let cancelled = false;
    const progress = new ProgressModal(this.app, files.length, () => {
      cancelled = true;
    });
    progress.open();

    for (let i = 0; i < files.length; i++) {
      if (cancelled) break;

      const file = files[i];
      progress.update(i, file.path, null);

      try {
        const success = await this.plugin.enhanceFrontmatterForFile(file);
        progress.update(i + 1, file.path, success);
      } catch (err) {
        console.error(`[Apply OpenCode] Failed to enhance ${file.path}:`, err);
        progress.update(i + 1, file.path, false);
      }
    }

    progress.complete();
    const { successes, failures } = progress.getResults();
    new Notice(`Bulk enhance: ${successes} done, ${failures} failed${cancelled ? " (cancelled)" : ""}`);
  }
}
