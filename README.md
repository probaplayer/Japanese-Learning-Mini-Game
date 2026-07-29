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

Questions are authored through the MCP server in `mcp-server/`, connected to Claude Desktop:

1. Install dependencies once: `cd mcp-server && npm install`
2. Add this repo's MCP server to your Claude Desktop config (`claude_desktop_config.json`):
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
3. Restart Claude Desktop, then ask Claude to create/edit question sets — it has tools to list, create, and delete sets, and to add, update, or delete individual questions.
4. Ask Claude to **publish** when you're ready — it commits the changes under `questions/` and pushes to `main`, which GitHub Pages redeploys automatically.

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
