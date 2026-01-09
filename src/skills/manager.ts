import { requestUrl } from "obsidian";
import { SkillSource, SkillCache, SKILL_SOURCES, KEPANO_REPO } from "./types";
import { EMBEDDED_OBSIDIAN_BASES, EMBEDDED_JSON_CANVAS, EMBEDDED_OBSIDIAN_MARKDOWN } from "./embedded";

interface GitHubContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

const EMBEDDED_SKILLS: Record<string, string> = {
  "obsidian-bases": EMBEDDED_OBSIDIAN_BASES,
  "json-canvas": EMBEDDED_JSON_CANVAS,
  "obsidian-markdown": EMBEDDED_OBSIDIAN_MARKDOWN,
};

export class SkillManager {
  private cache: SkillCache = {};
  private updatePromise: Promise<void> | null = null;

  /**
   * Load skill cache from plugin data
   */
  loadCache(data: SkillCache | undefined): void {
    if (data) {
      this.cache = data;
    }
  }

  /**
   * Get current cache for persistence
   */
  getCache(): SkillCache {
    return this.cache;
  }

  /**
   * Get skill content by name
   * Returns cached version if available, otherwise embedded fallback
   */
  getSkill(name: string): string {
    const cached = this.cache[name];
    if (cached?.content) {
      return cached.content;
    }
    return EMBEDDED_SKILLS[name] || "";
  }

  /**
   * Check for updates from GitHub and update cache silently
   * Called on plugin load
   */
  async checkForUpdates(): Promise<void> {
    // Prevent concurrent update checks
    if (this.updatePromise) {
      return this.updatePromise;
    }

    this.updatePromise = this.performUpdateCheck();
    try {
      await this.updatePromise;
    } finally {
      this.updatePromise = null;
    }
  }

  private async performUpdateCheck(): Promise<void> {
    const updatePromises = SKILL_SOURCES.map(source => this.updateSkillIfNeeded(source));
    await Promise.allSettled(updatePromises);
  }

  private async updateSkillIfNeeded(source: SkillSource): Promise<void> {
    try {
      const response = await this.fetchSkillFromGitHub(source);
      if (!response) return;

      const cached = this.cache[source.name];
      
      // Update if SHA differs or no cache exists
      if (!cached || cached.sha !== response.sha) {
        const content = this.decodeBase64(response.content);
        this.cache[source.name] = {
          content,
          sha: response.sha,
          lastChecked: Date.now(),
        };
        console.debug(`[Apply OpenCode] Updated skill: ${source.name}`);
      } else {
        // Update lastChecked even if content unchanged
        cached.lastChecked = Date.now();
      }
    } catch (err) {
      // Silent failure - will use embedded fallback
      console.debug(`[Apply OpenCode] Failed to fetch skill ${source.name}:`, err);
    }
  }

  private async fetchSkillFromGitHub(source: SkillSource): Promise<GitHubContentResponse | null> {
    const url = `https://api.github.com/repos/${KEPANO_REPO}/contents/${source.path}`;
    
    try {
      const response = await requestUrl({
        url,
        method: "GET",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "ApplyOpenCode-Obsidian-Plugin",
        },
      });

      if (response.status === 200) {
        return response.json as GitHubContentResponse;
      }
      return null;
    } catch {
      return null;
    }
  }

  private decodeBase64(content: string): string {
    // GitHub returns base64 encoded content with newlines
    const cleaned = content.replace(/\n/g, "");
    // Use Buffer in Node.js environment (Obsidian uses Electron)
    return Buffer.from(cleaned, "base64").toString("utf-8");
  }

  /**
   * Force refresh all skills from GitHub
   */
  async forceRefresh(): Promise<void> {
    // Clear SHA to force re-download
    for (const source of SKILL_SOURCES) {
      const cached = this.cache[source.name];
      if (cached) {
        cached.sha = "";
      }
    }
    await this.checkForUpdates();
  }
}

// Singleton instance
let skillManagerInstance: SkillManager | null = null;

export function getSkillManager(): SkillManager {
  if (!skillManagerInstance) {
    skillManagerInstance = new SkillManager();
  }
  return skillManagerInstance;
}
