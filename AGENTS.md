# AGENTS.md — 日本語 QUEST

## Project Overview

A vanilla HTML/CSS/JavaScript Japanese learning mini-game app. No build system, no package manager.
Runs directly in browser or via any static server.

## How to Run

1. Open `index.html` directly in a browser
2. Or serve via static server: `python -m http.server` (from project root)

## Build / Test Commands

- **No build commands**: This is a vanilla JS project, no bundler/compiler needed
- **No test framework**: Currently no automated tests exist
- **Manual testing**: Open `index.html` in browser to test changes

## Architecture

### File Structure
```
index.html       - Single-page app with all screens
style.css        - Retro arcade CSS styling
main.js          - Core state, navigation, storage, utilities
data.js          - Sample question data (SAMPLE_DATA)
game-quiz.js     - Multiple choice quiz game
game-listen.js   - Listening quiz (TTS-based)
game-flash.js    - Flashcard game
game-match.js    - Match pairs game
game-type.js     - Falling words typing game
lib/wanakana.min.js - Optional Japanese input library
```

### Script Load Order (in index.html)
Scripts load in this order: `data.js`, `main.js`, `game-quiz.js`, `game-flash.js`, `game-match.js`, `game-type.js`

### Key Globals (in main.js)
- `questions` - Current question array
- `questionSets` - All question sets
- `activeSetId` - Currently active set ID
- `settings` - Game settings object
- `playerHP`, `playerEXP`, `playerLevel`, `playerCombo` - Player state
- `SAMPLE_DATA` - Imported from data.js

### Key Functions
- `showScreen(id)` - Navigate between screens (menu, quiz, listen, flash, match, type, data, settings)
- `saveToStorage()` / `loadFromStorage()` - LocalStorage persistence
- `shuffle(arr)` - Fisher-Yates shuffle
- `escapeHtml(value)` - XSS prevention
- `showToast(msg, type)` - Display notifications
- `startGame(type)` - Launch a specific game

### Screen IDs
`screen-menu`, `screen-quiz`, `screen-listen`, `screen-flash`, `screen-match`, `screen-type`, `screen-data`, `screen-settings`

## Code Style Guidelines

### Comments
```javascript
// Section header (full width)
function myFunction() {
  // ─── Subsection ───
  // Inline comment for explanation
}
```

### Naming Conventions
- **Functions/variables**: `camelCase` (e.g., `startQuiz`, `playerHP`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `XP_PER_LEVEL`, `DATA_PAGE_SIZE`)
- **CSS classes**: `kebab-case` (e.g., `choice-btn`, `hp-fill`)
- **Question object keys**: `camelCase` (e.g., `word`, `romaji`, `translation`, `q`, `a`, `c`, `ex`)

### JavaScript Patterns

**Global state**: Top-level `let` declarations
```javascript
let questions = [];
let quizDeck = [];
```

**Constants**: Define after globals
```javascript
const XP_PER_LEVEL = 100;
```

**DOM-ready initialization**:
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // init code
});
```

**Error handling**: Use try/catch with user-facing error messages
```javascript
try {
  const parsed = JSON.parse(raw);
  // validation
} catch (e) {
  setStatus('data-status', `❌ Error: ${e.message}`, 'err');
  showToast(`❌ Import failed: ${e.message}`, 'err');
}
```

**Null checks**: Always verify elements exist
```javascript
const el = document.getElementById('quiz-hp');
if (!el) return;
```

### HTML Patterns

**Button with click handler**:
```html
<button type="button" class="menu-btn" onclick="startGame('quiz')">
```

**Screen structure**:
```html
<div id="screen-quiz" class="screen">
  <!-- screen content -->
</div>
```

### CSS Patterns

**CSS custom properties** for theming:
```css
:root {
  --bg: #0a0a12;
  --accent: #ff2d55;
  --text: #e8e8ff;
}
```

**Retro arcade font stack**:
```css
font-family: var(--font-px);  /* 'Press Start 2P' for headers */
font-family: var(--font-jp);  /* 'Noto Sans JP' for body */
```

## Data Format

Question object structure:
```javascript
{
  "word": "学生",        // Japanese word/kanji
  "romaji": "がくせい",  // Romaji reading
  "translation": "Học sinh", // Vietnamese translation
  "q": "Cách đọc của '学生' là gì?", // Question text
  "a": ["がくせい", "がくぜい", "がっせい", "かくせい"], // Answer options
  "c": 0,                // Correct answer index
  "ex": "学生 (Học sinh). Học (学) + Sinh (生).", // Explanation
  "aTranslation": ["Học sinh", "(từ không có nghĩa)", "(từ không có nghĩa)", "(từ không có nghĩa)"] // Optional: per-answer translation, same order as "a"
}
```

## Important Notes

- **Do NOT break script load order** in index.html — games depend on main.js being loaded first
- **script.js** exists but is NOT loaded — treat as legacy
- **Screen-settings** should only contain settings UI, not import/export
- **Screen-data** handles import/export and question management
- Use `escapeHtml()` before inserting any user data into innerHTML
- All player data persists via localStorage with prefix `jq_`

## Copilot Instructions (from .github/copilot-instructions.md)

> Đây là một ứng dụng web học tiếng Nhật nhỏ, viết thuần bằng HTML/CSS/JavaScript.
> No build system, no package manager. Chạy trực tiếp bằng trình duyệt hoặc một static server đơn giản.
>
> - Giữ thay đổi nhẹ và rõ ràng; repo này không cần module bundler hay React
> - Ưu tiên sửa trong các file hiện có trước khi thêm file mới
> - Kiểm tra kỹ `index.html` trước khi đổi script load order hoặc xóa file
> - Dữ liệu người chơi và câu hỏi được lưu trong `localStorage`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Japanese-Learning-Mini-Game** (3833 symbols, 6275 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Japanese-Learning-Mini-Game/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Japanese-Learning-Mini-Game/clusters` | All functional areas |
| `gitnexus://repo/Japanese-Learning-Mini-Game/processes` | All execution flows |
| `gitnexus://repo/Japanese-Learning-Mini-Game/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
