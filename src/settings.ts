import { App, PluginSettingTab, Setting } from "obsidian";
import { spawn } from "child_process";
import ApplyOpenCodePlugin from "./main";

export type DiffStyle = "split" | "unified";

export interface ApplyOpenCodeSettings {
  model: string;
  opencodePath: string;
  customPrompt: string;
  ignoredProperties: string;
  diffStyle: DiffStyle;
  maxListItems: number;
}

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";

export const DEFAULT_SETTINGS: ApplyOpenCodeSettings = {
  model: "opencode/claude-sonnet-4-5",
  opencodePath: DEFAULT_OPENCODE_PATH,
  customPrompt: "",
  ignoredProperties: "created, modified, uid",
  diffStyle: "split",
  maxListItems: 3,
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
  }
}
