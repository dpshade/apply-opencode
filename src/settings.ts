import { App, PluginSettingTab, Setting } from "obsidian";
import { spawn } from "child_process";
import AutoFrontmatterPlugin from "./main";

export type DiffStyle = "split" | "unified";

export interface AutoFrontmatterSettings {
  model: string;
  opencodePath: string;
  customPrompt: string;
  enhancedProperties: string;
  ignoredProperties: string;
  diffStyle: DiffStyle;
}

const DEFAULT_OPENCODE_PATH = "/Users/dps/.opencode/bin/opencode";

export const DEFAULT_SETTINGS: AutoFrontmatterSettings = {
  model: "opencode/claude-sonnet-4-5",
  opencodePath: DEFAULT_OPENCODE_PATH,
  customPrompt: "",
  enhancedProperties: "tags, aliases, description, topics, related",
  ignoredProperties: "created, modified, uid",
  diffStyle: "split",
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

export class AutoFrontmatterSettingTab extends PluginSettingTab {
  plugin: AutoFrontmatterPlugin;

  constructor(app: App, plugin: AutoFrontmatterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    const models = await fetchAvailableModels(this.plugin.settings.opencodePath);

    const modelSetting = new Setting(containerEl)
      .setName("Model")
      .setDesc("OpenCode model to use for frontmatter enhancement.");

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
        .setDesc("OpenCode model (could not fetch model list - enter manually).")
        .addText((text) =>
          text
            .setPlaceholder("opencode/claude-sonnet-4-5")
            .setValue(this.plugin.settings.model)
            .onChange(async (value) => {
              this.plugin.settings.model = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("OpenCode path")
      .setDesc("Path to OpenCode executable.")
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
      .setName("Enhanced properties")
      .setDesc("Comma-separated list of frontmatter properties the AI should focus on enhancing.")
      .addText((text) =>
        text
          .setPlaceholder("tags, aliases, description")
          .setValue(this.plugin.settings.enhancedProperties)
          .onChange(async (value) => {
            this.plugin.settings.enhancedProperties = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ignored properties")
      .setDesc("Comma-separated list of frontmatter properties the AI should never modify.")
      .addText((text) =>
        text
          .setPlaceholder("created, modified, uid")
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
