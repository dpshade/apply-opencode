// Embedded skill content from https://github.com/kepano/obsidian-skills
// These serve as fallbacks when GitHub is unreachable

export const EMBEDDED_OBSIDIAN_BASES = `---
name: obsidian-bases
description: Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian.
---

# Obsidian Bases Skill

This skill enables Claude Code to create and edit valid Obsidian Bases (\`.base\` files) including views, filters, formulas, and all related configurations.

## Overview

Obsidian Bases are YAML-based files that define dynamic views of notes in an Obsidian vault. A Base file can contain multiple views, global filters, formulas, property configurations, and custom summaries.

## File Format

Base files use the \`.base\` extension and contain valid YAML. They can also be embedded in Markdown code blocks.

## Complete Schema

\`\`\`yaml
# Global filters apply to ALL views in the base
filters:
  # Can be a single filter string
  # OR a recursive filter object with and/or/not
  and: []
  or: []
  not: []

# Define formula properties that can be used across all views
formulas:
  formula_name: 'expression'

# Configure display names and settings for properties
properties:
  property_name:
    displayName: "Display Name"
  formula.formula_name:
    displayName: "Formula Display Name"
  file.ext:
    displayName: "Extension"

# Define custom summary formulas
summaries:
  custom_summary_name: 'values.mean().round(3)'

# Define one or more views
views:
  - type: table | cards | list | map
    name: "View Name"
    limit: 10                    # Optional: limit results
    groupBy:                     # Optional: group results
      property: property_name
      direction: ASC | DESC
    filters:                     # View-specific filters
      and: []
    order:                       # Properties to display in order
      - file.name
      - property_name
      - formula.formula_name
    summaries:                   # Map properties to summary formulas
      property_name: Average
\`\`\`

## Filter Syntax

Filters narrow down results. They can be applied globally or per-view.

### Filter Structure

\`\`\`yaml
# Single filter
filters: 'status == "done"'

# AND - all conditions must be true
filters:
  and:
    - 'status == "done"'
    - 'priority > 3'

# OR - any condition can be true
filters:
  or:
    - 'file.hasTag("book")'
    - 'file.hasTag("article")'

# NOT - exclude matching items
filters:
  not:
    - 'file.hasTag("archived")'

# Nested filters
filters:
  or:
    - file.hasTag("tag")
    - and:
        - file.hasTag("book")
        - file.hasLink("Textbook")
    - not:
        - file.hasTag("book")
        - file.inFolder("Required Reading")
\`\`\`

### Filter Operators

| Operator | Description |
|----------|-------------|
| \`==\` | equals |
| \`!=\` | not equal |
| \`>\` | greater than |
| \`<\` | less than |
| \`>=\` | greater than or equal |
| \`<=\` | less than or equal |
| \`&&\` | logical and |
| \`\\|\\|\` | logical or |
| \`!\` | logical not |

## Properties

### Three Types of Properties

1. **Note properties** - From frontmatter: \`note.author\` or just \`author\`
2. **File properties** - File metadata: \`file.name\`, \`file.mtime\`, etc.
3. **Formula properties** - Computed values: \`formula.my_formula\`

### File Properties Reference

| Property | Type | Description |
|----------|------|-------------|
| \`file.name\` | String | File name |
| \`file.basename\` | String | File name without extension |
| \`file.path\` | String | Full path to file |
| \`file.folder\` | String | Parent folder path |
| \`file.ext\` | String | File extension |
| \`file.size\` | Number | File size in bytes |
| \`file.ctime\` | Date | Created time |
| \`file.mtime\` | Date | Modified time |
| \`file.tags\` | List | All tags in file |
| \`file.links\` | List | Internal links in file |
| \`file.backlinks\` | List | Files linking to this file |
| \`file.embeds\` | List | Embeds in the note |
| \`file.properties\` | Object | All frontmatter properties |

## Formula Syntax

Formulas compute values from properties. Defined in the \`formulas\` section.

\`\`\`yaml
formulas:
  # Simple arithmetic
  total: "price * quantity"
  
  # Conditional logic
  status_icon: 'if(done, "✅", "⏳")'
  
  # String formatting
  formatted_price: 'if(price, price.toFixed(2) + " dollars")'
  
  # Date formatting
  created: 'file.ctime.format("YYYY-MM-DD")'
  
  # Complex expressions
  days_old: '((now() - file.ctime) / 86400000).round(0)'
\`\`\`

## Functions Reference

### Global Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| \`date()\` | \`date(string): date\` | Parse string to date. Format: \`YYYY-MM-DD HH:mm:ss\` |
| \`duration()\` | \`duration(string): duration\` | Parse duration string |
| \`now()\` | \`now(): date\` | Current date and time |
| \`today()\` | \`today(): date\` | Current date (time = 00:00:00) |
| \`if()\` | \`if(condition, trueResult, falseResult?)\` | Conditional |
| \`min()\` | \`min(n1, n2, ...): number\` | Smallest number |
| \`max()\` | \`max(n1, n2, ...): number\` | Largest number |
| \`number()\` | \`number(any): number\` | Convert to number |
| \`link()\` | \`link(path, display?): Link\` | Create a link |
| \`list()\` | \`list(element): List\` | Wrap in list if not already |
| \`file()\` | \`file(path): file\` | Get file object |
| \`image()\` | \`image(path): image\` | Create image for rendering |
| \`icon()\` | \`icon(name): icon\` | Lucide icon by name |
| \`html()\` | \`html(string): html\` | Render as HTML |
| \`escapeHTML()\` | \`escapeHTML(string): string\` | Escape HTML characters |

### Date Functions & Fields

**Fields:** \`date.year\`, \`date.month\`, \`date.day\`, \`date.hour\`, \`date.minute\`, \`date.second\`, \`date.millisecond\`

| Function | Signature | Description |
|----------|-----------|-------------|
| \`date()\` | \`date.date(): date\` | Remove time portion |
| \`format()\` | \`date.format(string): string\` | Format with Moment.js pattern |
| \`time()\` | \`date.time(): string\` | Get time as string |
| \`relative()\` | \`date.relative(): string\` | Human-readable relative time |
| \`isEmpty()\` | \`date.isEmpty(): boolean\` | Always false for dates |

### String Functions

**Field:** \`string.length\`

| Function | Signature | Description |
|----------|-----------|-------------|
| \`contains()\` | \`string.contains(value): boolean\` | Check substring |
| \`containsAll()\` | \`string.containsAll(...values): boolean\` | All substrings present |
| \`containsAny()\` | \`string.containsAny(...values): boolean\` | Any substring present |
| \`startsWith()\` | \`string.startsWith(query): boolean\` | Starts with query |
| \`endsWith()\` | \`string.endsWith(query): boolean\` | Ends with query |
| \`isEmpty()\` | \`string.isEmpty(): boolean\` | Empty or not present |
| \`lower()\` | \`string.lower(): string\` | To lowercase |
| \`title()\` | \`string.title(): string\` | To Title Case |
| \`trim()\` | \`string.trim(): string\` | Remove whitespace |
| \`replace()\` | \`string.replace(pattern, replacement): string\` | Replace pattern |
| \`split()\` | \`string.split(separator, n?): list\` | Split to list |

### Number Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| \`abs()\` | \`number.abs(): number\` | Absolute value |
| \`ceil()\` | \`number.ceil(): number\` | Round up |
| \`floor()\` | \`number.floor(): number\` | Round down |
| \`round()\` | \`number.round(digits?): number\` | Round to digits |
| \`toFixed()\` | \`number.toFixed(precision): string\` | Fixed-point notation |
| \`isEmpty()\` | \`number.isEmpty(): boolean\` | Not present |

### List Functions

**Field:** \`list.length\`

| Function | Signature | Description |
|----------|-----------|-------------|
| \`contains()\` | \`list.contains(value): boolean\` | Element exists |
| \`containsAll()\` | \`list.containsAll(...values): boolean\` | All elements exist |
| \`containsAny()\` | \`list.containsAny(...values): boolean\` | Any element exists |
| \`filter()\` | \`list.filter(expression): list\` | Filter by condition (uses \`value\`, \`index\`) |
| \`map()\` | \`list.map(expression): list\` | Transform elements (uses \`value\`, \`index\`) |
| \`flat()\` | \`list.flat(): list\` | Flatten nested lists |
| \`join()\` | \`list.join(separator): string\` | Join to string |
| \`reverse()\` | \`list.reverse(): list\` | Reverse order |
| \`slice()\` | \`list.slice(start, end?): list\` | Sublist |
| \`sort()\` | \`list.sort(): list\` | Sort ascending |
| \`unique()\` | \`list.unique(): list\` | Remove duplicates |
| \`isEmpty()\` | \`list.isEmpty(): boolean\` | No elements |

### File Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| \`asLink()\` | \`file.asLink(display?): Link\` | Convert to link |
| \`hasLink()\` | \`file.hasLink(otherFile): boolean\` | Has link to file |
| \`hasTag()\` | \`file.hasTag(...tags): boolean\` | Has any of the tags |
| \`hasProperty()\` | \`file.hasProperty(name): boolean\` | Has property |
| \`inFolder()\` | \`file.inFolder(folder): boolean\` | In folder or subfolder |

## View Types

### Table View

\`\`\`yaml
views:
  - type: table
    name: "My Table"
    order:
      - file.name
      - status
      - due_date
    summaries:
      price: Sum
      count: Average
\`\`\`

### Cards View

\`\`\`yaml
views:
  - type: cards
    name: "Gallery"
    order:
      - file.name
      - cover_image
      - description
\`\`\`

### List View

\`\`\`yaml
views:
  - type: list
    name: "Simple List"
    order:
      - file.name
      - status
\`\`\`

## Default Summary Formulas

| Name | Input Type | Description |
|------|------------|-------------|
| \`Average\` | Number | Mathematical mean |
| \`Min\` | Number | Smallest number |
| \`Max\` | Number | Largest number |
| \`Sum\` | Number | Sum of all numbers |
| \`Range\` | Number | Max - Min |
| \`Median\` | Number | Mathematical median |
| \`Earliest\` | Date | Earliest date |
| \`Latest\` | Date | Latest date |
| \`Checked\` | Boolean | Count of true values |
| \`Unchecked\` | Boolean | Count of false values |
| \`Empty\` | Any | Count of empty values |
| \`Filled\` | Any | Count of non-empty values |
| \`Unique\` | Any | Count of unique values |

## Complete Example

\`\`\`yaml
filters:
  and:
    - file.hasTag("task")
    - 'file.ext == "md"'

formulas:
  days_until_due: 'if(due, ((date(due) - today()) / 86400000).round(0), "")'
  is_overdue: 'if(due, date(due) < today() && status != "done", false)'
  priority_label: 'if(priority == 1, "🔴 High", if(priority == 2, "🟡 Medium", "🟢 Low"))'

properties:
  status:
    displayName: Status
  formula.days_until_due:
    displayName: "Days Until Due"
  formula.priority_label:
    displayName: Priority

views:
  - type: table
    name: "Active Tasks"
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - status
      - formula.priority_label
      - due
      - formula.days_until_due
    groupBy:
      property: status
      direction: ASC
    summaries:
      formula.days_until_due: Average

  - type: table
    name: "Completed"
    filters:
      and:
        - 'status == "done"'
    order:
      - file.name
      - completed_date
\`\`\`

## References

- [Bases Syntax](https://help.obsidian.md/bases/syntax)
- [Functions](https://help.obsidian.md/bases/functions)
- [Views](https://help.obsidian.md/bases/views)
- [Formulas](https://help.obsidian.md/formulas)
`;

export const EMBEDDED_JSON_CANVAS = `---
name: json-canvas
description: Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian.
---

# JSON Canvas Skill

This skill enables Claude Code to create and edit valid JSON Canvas files (\`.canvas\`) used in Obsidian and other applications.

## Overview

JSON Canvas is an open file format for infinite canvas data. Canvas files use the \`.canvas\` extension and contain valid JSON following the [JSON Canvas Spec 1.0](https://jsoncanvas.org/spec/1.0/).

## File Structure

A canvas file contains two top-level arrays:

\`\`\`json
{
  "nodes": [],
  "edges": []
}
\`\`\`

- \`nodes\` (optional): Array of node objects
- \`edges\` (optional): Array of edge objects connecting nodes

## Nodes

Nodes are objects placed on the canvas. There are four node types:
- \`text\` - Text content with Markdown
- \`file\` - Reference to files/attachments
- \`link\` - External URL
- \`group\` - Visual container for other nodes

### Generic Node Attributes

All nodes share these attributes:

| Attribute | Required | Type | Description |
|-----------|----------|------|-------------|
| \`id\` | Yes | string | Unique identifier for the node |
| \`type\` | Yes | string | Node type: \`text\`, \`file\`, \`link\`, or \`group\` |
| \`x\` | Yes | integer | X position in pixels |
| \`y\` | Yes | integer | Y position in pixels |
| \`width\` | Yes | integer | Width in pixels |
| \`height\` | Yes | integer | Height in pixels |
| \`color\` | No | canvasColor | Node color (see Color section) |

### Text Nodes

\`\`\`json
{
  "id": "6f0ad84f44ce9c17",
  "type": "text",
  "x": 0,
  "y": 0,
  "width": 400,
  "height": 200,
  "text": "# Hello World\\n\\nThis is **Markdown** content."
}
\`\`\`

### File Nodes

\`\`\`json
{
  "id": "a1b2c3d4e5f67890",
  "type": "file",
  "x": 500,
  "y": 0,
  "width": 400,
  "height": 300,
  "file": "Attachments/diagram.png"
}
\`\`\`

### Link Nodes

\`\`\`json
{
  "id": "c3d4e5f678901234",
  "type": "link",
  "x": 1000,
  "y": 0,
  "width": 400,
  "height": 200,
  "url": "https://obsidian.md"
}
\`\`\`

### Group Nodes

\`\`\`json
{
  "id": "d4e5f6789012345a",
  "type": "group",
  "x": -50,
  "y": -50,
  "width": 1000,
  "height": 600,
  "label": "Project Overview",
  "color": "4"
}
\`\`\`

| Attribute | Required | Type | Description |
|-----------|----------|------|-------------|
| \`label\` | No | string | Text label for the group |
| \`background\` | No | string | Path to background image |
| \`backgroundStyle\` | No | string | Background rendering style: \`cover\`, \`ratio\`, \`repeat\` |

## Edges

Edges are lines connecting nodes.

\`\`\`json
{
  "id": "f67890123456789a",
  "fromNode": "6f0ad84f44ce9c17",
  "toNode": "a1b2c3d4e5f67890"
}
\`\`\`

| Attribute | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| \`id\` | Yes | string | - | Unique identifier for the edge |
| \`fromNode\` | Yes | string | - | Node ID where connection starts |
| \`fromSide\` | No | string | - | Side where edge starts: \`top\`, \`right\`, \`bottom\`, \`left\` |
| \`fromEnd\` | No | string | \`none\` | Shape at edge start: \`none\`, \`arrow\` |
| \`toNode\` | Yes | string | - | Node ID where connection ends |
| \`toSide\` | No | string | - | Side where edge ends |
| \`toEnd\` | No | string | \`arrow\` | Shape at edge end |
| \`color\` | No | canvasColor | - | Line color |
| \`label\` | No | string | - | Text label for the edge |

## Colors

The \`canvasColor\` type can be specified in two ways:

### Hex Colors
\`\`\`json
{ "color": "#FF0000" }
\`\`\`

### Preset Colors
\`\`\`json
{ "color": "1" }
\`\`\`

| Preset | Color |
|--------|-------|
| \`"1"\` | Red |
| \`"2"\` | Orange |
| \`"3"\` | Yellow |
| \`"4"\` | Green |
| \`"5"\` | Cyan |
| \`"6"\` | Purple |

## ID Generation

Node and edge IDs must be unique strings. Use 16-character hexadecimal IDs:
\`\`\`
"id": "6f0ad84f44ce9c17"
\`\`\`

## Layout Guidelines

### Positioning
- Coordinates can be negative (canvas extends infinitely)
- \`x\` increases to the right
- \`y\` increases downward
- Position refers to top-left corner of node

### Recommended Sizes

| Node Type | Suggested Width | Suggested Height |
|-----------|-----------------|------------------|
| Small text | 200-300 | 80-150 |
| Medium text | 300-450 | 150-300 |
| Large text | 400-600 | 300-500 |
| File preview | 300-500 | 200-400 |
| Link preview | 250-400 | 100-200 |

### Spacing
- Leave 20-50px padding inside groups
- Space nodes 50-100px apart for readability
- Align nodes to grid (multiples of 10 or 20) for cleaner layouts

## Complete Examples

### Simple Canvas with Text and Connections

\`\`\`json
{
  "nodes": [
    {
      "id": "8a9b0c1d2e3f4a5b",
      "type": "text",
      "x": 0,
      "y": 0,
      "width": 300,
      "height": 150,
      "text": "# Main Idea\\n\\nThis is the central concept."
    },
    {
      "id": "1a2b3c4d5e6f7a8b",
      "type": "text",
      "x": 400,
      "y": -100,
      "width": 250,
      "height": 100,
      "text": "## Supporting Point A\\n\\nDetails here."
    },
    {
      "id": "2b3c4d5e6f7a8b9c",
      "type": "text",
      "x": 400,
      "y": 100,
      "width": 250,
      "height": 100,
      "text": "## Supporting Point B\\n\\nMore details."
    }
  ],
  "edges": [
    {
      "id": "3c4d5e6f7a8b9c0d",
      "fromNode": "8a9b0c1d2e3f4a5b",
      "fromSide": "right",
      "toNode": "1a2b3c4d5e6f7a8b",
      "toSide": "left"
    },
    {
      "id": "4d5e6f7a8b9c0d1e",
      "fromNode": "8a9b0c1d2e3f4a5b",
      "fromSide": "right",
      "toNode": "2b3c4d5e6f7a8b9c",
      "toSide": "left"
    }
  ]
}
\`\`\`

### Project Board with Groups

\`\`\`json
{
  "nodes": [
    {
      "id": "5e6f7a8b9c0d1e2f",
      "type": "group",
      "x": 0,
      "y": 0,
      "width": 300,
      "height": 500,
      "label": "To Do",
      "color": "1"
    },
    {
      "id": "6f7a8b9c0d1e2f3a",
      "type": "group",
      "x": 350,
      "y": 0,
      "width": 300,
      "height": 500,
      "label": "In Progress",
      "color": "3"
    },
    {
      "id": "7a8b9c0d1e2f3a4b",
      "type": "group",
      "x": 700,
      "y": 0,
      "width": 300,
      "height": 500,
      "label": "Done",
      "color": "4"
    },
    {
      "id": "8b9c0d1e2f3a4b5c",
      "type": "text",
      "x": 20,
      "y": 50,
      "width": 260,
      "height": 80,
      "text": "## Task 1\\n\\nImplement feature X"
    }
  ],
  "edges": []
}
\`\`\`

### Flowchart

\`\`\`json
{
  "nodes": [
    {
      "id": "a0b1c2d3e4f5a6b7",
      "type": "text",
      "x": 200,
      "y": 0,
      "width": 150,
      "height": 60,
      "text": "**Start**",
      "color": "4"
    },
    {
      "id": "b1c2d3e4f5a6b7c8",
      "type": "text",
      "x": 200,
      "y": 100,
      "width": 150,
      "height": 60,
      "text": "Step 1:\\nGather data"
    },
    {
      "id": "c2d3e4f5a6b7c8d9",
      "type": "text",
      "x": 200,
      "y": 200,
      "width": 150,
      "height": 80,
      "text": "**Decision**\\n\\nIs data valid?",
      "color": "3"
    }
  ],
  "edges": [
    {
      "id": "a6b7c8d9e0f1a2b3",
      "fromNode": "a0b1c2d3e4f5a6b7",
      "fromSide": "bottom",
      "toNode": "b1c2d3e4f5a6b7c8",
      "toSide": "top"
    },
    {
      "id": "b7c8d9e0f1a2b3c4",
      "fromNode": "b1c2d3e4f5a6b7c8",
      "fromSide": "bottom",
      "toNode": "c2d3e4f5a6b7c8d9",
      "toSide": "top"
    }
  ]
}
\`\`\`

## Validation Rules

1. All \`id\` values must be unique across nodes and edges
2. \`fromNode\` and \`toNode\` must reference existing node IDs
3. Required fields must be present for each node type
4. \`type\` must be one of: \`text\`, \`file\`, \`link\`, \`group\`
5. \`fromSide\`, \`toSide\` must be one of: \`top\`, \`right\`, \`bottom\`, \`left\`
6. \`fromEnd\`, \`toEnd\` must be one of: \`none\`, \`arrow\`
7. Color presets must be \`"1"\` through \`"6"\` or valid hex color

## References

- [JSON Canvas Spec 1.0](https://jsoncanvas.org/spec/1.0/)
- [JSON Canvas GitHub](https://github.com/obsidianmd/jsoncanvas)
`;

export const EMBEDDED_OBSIDIAN_MARKDOWN = `---
name: obsidian-markdown
description: Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes.
---

# Obsidian Flavored Markdown Skill

This skill enables Claude Code to create and edit valid Obsidian Flavored Markdown, including all Obsidian-specific syntax extensions.

## Overview

Obsidian uses a combination of Markdown flavors:
- [CommonMark](https://commonmark.org/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)
- [LaTeX](https://www.latex-project.org/) for math
- Obsidian-specific extensions (wikilinks, callouts, embeds, etc.)

## Internal Links (Wikilinks)

### Basic Links
\`\`\`markdown
[[Note Name]]
[[Note Name.md]]
[[Note Name|Display Text]]
\`\`\`

### Link to Headings
\`\`\`markdown
[[Note Name#Heading]]
[[Note Name#Heading|Custom Text]]
[[#Heading in same note]]
\`\`\`

### Link to Blocks
\`\`\`markdown
[[Note Name#^block-id]]
[[Note Name#^block-id|Custom Text]]
\`\`\`

Define a block ID by adding \`^block-id\` at the end of a paragraph:
\`\`\`markdown
This is a paragraph that can be linked to. ^my-block-id
\`\`\`

## Embeds

### Embed Notes
\`\`\`markdown
![[Note Name]]
![[Note Name#Heading]]
![[Note Name#^block-id]]
\`\`\`

### Embed Images
\`\`\`markdown
![[image.png]]
![[image.png|640x480]]    Width x Height
![[image.png|300]]        Width only (maintains aspect ratio)
\`\`\`

### Embed PDF
\`\`\`markdown
![[document.pdf]]
![[document.pdf#page=3]]
![[document.pdf#height=400]]
\`\`\`

## Callouts

### Basic Callout
\`\`\`markdown
> [!note]
> This is a note callout.

> [!info] Custom Title
> This callout has a custom title.
\`\`\`

### Foldable Callouts
\`\`\`markdown
> [!faq]- Collapsed by default
> This content is hidden until expanded.

> [!faq]+ Expanded by default
> This content is visible but can be collapsed.
\`\`\`

### Supported Callout Types

| Type | Aliases | Description |
|------|---------|-------------|
| \`note\` | - | Blue, pencil icon |
| \`abstract\` | \`summary\`, \`tldr\` | Teal, clipboard icon |
| \`info\` | - | Blue, info icon |
| \`todo\` | - | Blue, checkbox icon |
| \`tip\` | \`hint\`, \`important\` | Cyan, flame icon |
| \`success\` | \`check\`, \`done\` | Green, checkmark icon |
| \`question\` | \`help\`, \`faq\` | Yellow, question mark |
| \`warning\` | \`caution\`, \`attention\` | Orange, warning icon |
| \`failure\` | \`fail\`, \`missing\` | Red, X icon |
| \`danger\` | \`error\` | Red, zap icon |
| \`bug\` | - | Red, bug icon |
| \`example\` | - | Purple, list icon |
| \`quote\` | \`cite\` | Gray, quote icon |

## Text Formatting

| Style | Syntax | Example |
|-------|--------|---------|
| Bold | \`**text**\` | **Bold** |
| Italic | \`*text*\` | *Italic* |
| Bold + Italic | \`***text***\` | ***Both*** |
| Strikethrough | \`~~text~~\` | ~~Striked~~ |
| Highlight | \`==text==\` | ==Highlighted== |
| Inline code | \`\\\`code\\\`\` | \`code\` |

## Task Lists

\`\`\`markdown
- [ ] Incomplete task
- [x] Completed task
- [ ] Task with sub-tasks
  - [ ] Subtask 1
  - [x] Subtask 2
\`\`\`

## Code Blocks

\`\`\`\`markdown
\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`
\`\`\`\`

## Math (LaTeX)

### Inline Math
\`\`\`markdown
This is inline math: $e^{i\\pi} + 1 = 0$
\`\`\`

### Block Math
\`\`\`markdown
$$
\\begin{vmatrix}
a & b \\\\
c & d
\\end{vmatrix} = ad - bc
$$
\`\`\`

## Diagrams (Mermaid)

\`\`\`\`markdown
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do this]
    B -->|No| D[Do that]
\`\`\`
\`\`\`\`

## Footnotes

\`\`\`markdown
This sentence has a footnote[^1].

[^1]: This is the footnote content.

Inline footnotes are also supported.^[This is an inline footnote.]
\`\`\`

## Comments

\`\`\`markdown
This is visible %%but this is hidden%% text.

%%
This entire block is hidden.
It won't appear in reading view.
%%
\`\`\`

## Properties (Frontmatter)

Properties use YAML frontmatter at the start of a note:

\`\`\`yaml
---
title: My Note Title
date: 2024-01-15
tags:
  - project
  - important
aliases:
  - My Note
  - Alternative Name
cssclasses:
  - custom-class
status: in-progress
rating: 4.5
completed: false
due: 2024-02-01T14:30:00
---
\`\`\`

### Property Types

| Type | Example |
|------|---------|
| Text | \`title: My Title\` |
| Number | \`rating: 4.5\` |
| Checkbox | \`completed: true\` |
| Date | \`date: 2024-01-15\` |
| Date & Time | \`due: 2024-01-15T14:30:00\` |
| List | \`tags: [one, two]\` or YAML list |
| Links | \`related: "[[Other Note]]"\` |

### Default Properties
- \`tags\` - Note tags
- \`aliases\` - Alternative names for the note
- \`cssclasses\` - CSS classes applied to the note

## Tags

\`\`\`markdown
#tag
#nested/tag
#tag-with-dashes
#tag_with_underscores
\`\`\`

Tags can contain:
- Letters (any language)
- Numbers (not as first character)
- Underscores \`_\`
- Hyphens \`-\`
- Forward slashes \`/\` (for nesting)

## References

- [Basic formatting syntax](https://help.obsidian.md/syntax)
- [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax)
- [Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown)
- [Internal links](https://help.obsidian.md/links)
- [Embed files](https://help.obsidian.md/embeds)
- [Callouts](https://help.obsidian.md/callouts)
- [Properties](https://help.obsidian.md/properties)
`;
