# Apply OpenCode

AI-powered frontmatter enhancement and title generation for Obsidian, using [OpenCode](https://opencode.ai) CLI.

## Features

### Frontmatter Enhancement
- Analyzes note content and suggests frontmatter improvements
- Learns from similar notes in your vault to match your existing schema
- Shows diff preview before applying changes
- Never removes existing values - only adds or extends

### AI Title Generation
- Generate meaningful 2-5 word titles from note content
- Ribbon icon for quick access
- Optional confirmation modal before rename
- Bulk rename all "Untitled" files at once

### Content Generation
- Generate 500-1000 characters at cursor position
- Select text to replace it with AI-generated content
- Uses note title, frontmatter, and surrounding context for relevance
- Optional instruction to guide generation (e.g., "summarize", "expand", "add examples")

### Wiki Link Identification
- Identify entities in notes that should become wiki links
- Two strategies: existing notes only (instant) or all entities via AI
- Configurable mode: first mention only or all mentions
- Shows diff preview before applying changes
- Smart selection handling: processes selection if present, otherwise full note
- Safety guaranteed: only adds `[[` and `]]` brackets, never modifies content

## Installation

### Using BRAT (Recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings and click "Add Beta plugin"
3. Enter: `dpshade/apply-opencode`
4. Enable the plugin in Settings > Community plugins

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `.obsidian/plugins/apply-opencode/` in your vault
3. Copy downloaded files into the folder
4. Reload Obsidian and enable the plugin in Settings > Community plugins

### Requirements

- [OpenCode CLI](https://opencode.ai) installed and configured
- Default path: `~/.opencode/bin/opencode`

## Usage

### Enhance Frontmatter
1. Open a note
2. Run command: **Apply OpenCode: Enhance note frontmatter**
3. Review diff and apply changes

### Generate Title
1. Open a note
2. Click the brain icon in the ribbon, or run command: **Apply OpenCode: Generate AI title for current file**
3. File is renamed based on content

### Generate Content
1. Place cursor where you want content, or select text to replace
2. Run command: **Apply OpenCode: Generate content at cursor**
3. Optionally type an instruction (e.g., "add a conclusion"), or leave empty for natural continuation
4. Press **Enter** to generate

### Identify Wiki Links
1. Open a note (optionally select specific text)
2. Run command: **Apply OpenCode: Identify and add wiki links**
3. Review the diff showing proposed wiki links
4. Click on any green line to remove that link
5. Click "Apply changes" to add the wiki links

### Bulk Operations (Settings)
- **Bulk rename untitled files** - Rename all files with "Untitled" in the name
- **Bulk enhance frontmatter** - Add frontmatter to all files missing it

## Settings

| Setting | Description |
|---------|-------------|
| Model | OpenCode model for AI operations |
| Executable path | Path to opencode CLI |
| Diff view style | Side-by-side or unified diff |
| Max list items | Limit for array properties (tags, etc.) |
| Note search mode | Algorithm (top 5 scored) or Semantic (all titles) |
| Wiki link strategy | Existing notes only (fast) or All entities via AI (slow) |
| Wiki link mode | First mention only or All mentions |
| Ignored properties | Properties AI should never modify |
| Custom prompt | Additional instructions for enhancement |
| Confirm before rename | Show modal before title rename |

## How It Works

1. **Find similar notes** - Scores all notes with frontmatter by superset matching, links, tags, folder, recency
2. **Extract schema** - Builds list of valid properties from top 5 similar notes
3. **Generate enhancement** - Sends note + examples to OpenCode, requests YAML frontmatter
4. **Merge carefully** - Adds new properties, extends arrays, never overwrites existing values
5. **Review & apply** - Shows diff modal for user approval

## License

MIT
