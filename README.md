# 日本語 QUEST — Japanese Learning Mini-Games

> 🎮 A retro-arcade styled web app for learning Japanese vocabulary. Built with pure HTML/CSS/JavaScript — no frameworks, no build tools.

## ✨ Features

### 🕹️ 6 Mini-Games

| Game | Description |
|------|-------------|
| 📝 **Quiz** | Multiple-choice questions with timer & combo system |
| 🎧 **Listening Quiz** | Hear Japanese words via TTS, pick the correct reading |
| ⌨ **Falling Words** | Type romaji before words hit the ground |
| 🧩 **Match** | Pair Japanese words with correct readings/translations |
| 🃏 **Flashcard** | Flip cards, self-assess with 4 levels: New / Learning / Familiar / Mastered |
| ✍️ **Writing Practice** | Type Japanese characters from memory |

### 🧠 Smart Learning System

- **Exponential time-decay priority** — recent mistakes weigh more, old mistakes fade (0.85^days)
- **4-level flashcard self-assessment** — New / Learning / Familiar / Mastered with differentiated tracking
- **Auto incorrect reduction** — every 3 correct answers in a row reduces incorrect count
- **Confidence scoring** — questions classified as New / Learning / Familiar / Mastered
- **Adjustable weights**: Incorrect Answer, Time Since Seen, Learning Effect, Slow Response
- **Per-game settings override** — customize difficulty per game mode
- **Progress tracking** — HP, EXP, Level, Combo system persisted in localStorage

### 📦 Question Sets

- Question sets live as JSON files in `questions/`, listed in `questions/manifest.json`
- The game only ever *reads* these files (via `fetch`) and lets you switch between them — no in-browser editing
- Sets are authored, edited, and published through the MCP server in `mcp-server/` (see below)

### ⚙️ Customizable Settings

- Timer options (10s–60s per question)
- Game speed controls (Slow/Medium/Fast)
- Scanlines overlay toggle
- Animation toggle
- HP/Game Over disable option

## 🚀 How to Run

Question sets are fetched over HTTP at runtime, so the game must be served — opening `index.html` directly via `file://` will fail to load any questions (browsers block `fetch()` from the `file://` origin).

```bash
python -m http.server
```

Then visit `http://localhost:8000`

**No installation, no dependencies, no build step** — just a static file server.

## 🏗️ Architecture

```
index.html               ← Single-page app, all screens
css/                      ← Retro arcade theme (variables, base, per-game styles)
questions/                ← Question set data (manifest.json + one JSON file per set)
js/main.js                ← Core: state, navigation, utilities
js/game-utils.js          ← Question scoring/priority helpers
js/storage.js             ← localStorage + question set loading (fetch from questions/)
js/settings.js            ← Settings screen logic
js/games/game-quiz.js     ← Multiple choice quiz
js/games/game-listen.js   ← TTS-based listening quiz
js/games/game-flash.js    ← Flashcard game
js/games/game-match.js    ← Match pairs game
js/games/game-type.js     ← Falling words typing game
js/games/game-write.js    ← Writing practice game
lib/wanakana.min.js       ← Japanese input library
mcp-server/               ← MCP server for authoring/publishing question sets
```

## 📝 Question Data Format

```json
{
  "word": "学生",
  "romaji": "がくせい",
  "translation": "Học sinh",
  "q": "Cách đọc của '学生' là gì?",
  "a": ["がくせい", "がくぜい", "がっせい", "かくせい"],
  "c": 0,
  "ex": "学生 (Học sinh). Học (学) + Sinh (生)."
}
```

| Field | Description |
|-------|-------------|
| `word` | Japanese word/kanji |
| `romaji` | Reading (hiragana/katakana/romaji) |
| `translation` | Vietnamese translation |
| `q` | Question text |
| `a` | Array of answer options |
| `c` | Correct answer index (0-based) |
| `ex` | Explanation shown after answering |

## 🎨 Design

- **Theme**: Retro arcade with scanlines, neon glow, pixel font
- **Fonts**: Press Start 2P (headers), Noto Sans JP (Japanese text)
- **Background**: Animated starfield (Canvas)
- **Responsive**: Desktop-first with 150% zoom on large screens

## 🌐 Browser Support

- Chrome/Edge (recommended — full TTS support)
- Firefox
- Safari (TTS may vary)

## 📖 Adding Your Own Questions

Questions are authored through the MCP server in `mcp-server/`, connected to Claude Desktop.

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Locate your Claude Desktop config file

| OS | Path |
|----|------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Windows (Microsoft Store build) | `%LOCALAPPDATA%\Packages\<Claude package folder>\LocalCache\Roaming\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

If the file/folder doesn't exist yet, create it — Claude Desktop reads it on startup.

### 3. Add this repo's MCP server

Add a `japanese-quest-questions` entry under `mcpServers`. If the file already has other servers configured, only add this key — don't overwrite the rest of the file.

```json
{
  "mcpServers": {
    "japanese-quest-questions": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/src/index.js"]
    }
  }
}
```

Use forward slashes (`/`) in the path even on Windows — no escaping needed. `command` must be a `node` binary reachable from Claude Desktop (an absolute path to `node.exe`/`node` also works if `node` isn't on PATH for that process).

### 4. Restart Claude Desktop fully

Quit the app completely (from the system tray/menu bar, not just closing the window) and relaunch — config changes are only read on startup.

### 5. Verify the connection

- Check **Settings → Developer** (or **Extensions/Connectors**, depending on version) — `japanese-quest-questions` should be listed as connected.
- Or start a **new** chat and ask Claude to list question sets — it should call the `list_question_sets` tool.
- If it's not showing up, check the per-server log Claude Desktop writes (e.g. `.../logs/mcp-server-japanese-quest-questions.log` next to the config file) for the actual startup error.

### 6. Author and publish

Ask Claude to create/edit question sets — it has tools to list, create, and delete sets, and to add, update, or delete individual questions. To change just a few questions in a large set, ask Claude to **search** for the question by keyword (`search_questions`, matches word/romaji/translation/question text/explanation/answer choices) and **patch** only the fields that need to change (`patch_question`) instead of resending the whole question or recreating the set. Ask Claude to **publish** when you're ready — it commits the changes under `questions/` and pushes to `main`, which GitHub Pages redeploys automatically.

**Publish preconditions:**
- The repo checkout the server runs against must be on the `main` branch (the `publish` tool refuses otherwise).
- `git config user.name` / `user.email` must be set in that repo — `publish` commits with them.
- No uncommitted changes outside `questions/` — `publish` refuses if anything else is dirty.
- By default the server operates on the repo containing `mcp-server/`; override with the `REPO_ROOT` / `QUESTIONS_DIR` environment variables (set them in the `mcpServers` entry's `env` field) if you need to point it elsewhere.

## 🛠️ Tech Stack

- **HTML5** — Semantic structure, Canvas API
- **CSS3** — Custom properties, animations, responsive design
- **Vanilla JavaScript** — No frameworks, no bundlers
- **Web Speech API** — Text-to-Speech for listening quiz
- **WanaKana** — Japanese input/romanization library
- **localStorage** — Persistent player data & settings (question sets themselves live in `questions/`, not localStorage)

## 📄 License

MIT

## 🙏 Credits

- [WanaKana](https://github.com/WaniKani/WanaKana) — Japanese input library
- [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) — Pixel font
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) — Japanese font
