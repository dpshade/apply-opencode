export interface SkillSource {
  name: string;
  path: string; // GitHub API path: skills/{name}/SKILL.md
}

export interface SkillCacheEntry {
  content: string;
  sha: string;
  lastChecked: number;
}

export interface SkillCache {
  [skillName: string]: SkillCacheEntry;
}

export const SKILL_SOURCES: SkillSource[] = [
  { name: "obsidian-bases", path: "skills/obsidian-bases/SKILL.md" },
  { name: "json-canvas", path: "skills/json-canvas/SKILL.md" },
  { name: "obsidian-markdown", path: "skills/obsidian-markdown/SKILL.md" },
];

export const KEPANO_REPO = "kepano/obsidian-skills";
