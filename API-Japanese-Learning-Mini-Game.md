# 日本語 QUEST — API Documentation

## Table of Contents

- [Data Structures](#data-structures)
  - [Question Object](#question-object)
  - [QuestionSet Object](#questionset-object)
  - [Player State](#player-state)
  - [Settings Object](#settings-object)
  - [Question Stats](#question-stats)
  - [Session History](#session-history)
  - [Daily Streak](#daily-streak)
- [Storage API](#storage-api)
- [Question Set API](#question-set-api)
- [Data Manager API](#data-manager-api)
- [Question Stats API](#question-stats-api)
- [Settings API](#settings-api)
- [Game Utilities API](#game-utilities-api)
- [Firebase API](#firebase-api)

---

## Data Structures

### Question Object

```javascript
{
  "word": "学生",           // Japanese kanji/word (required)
  "romaji": "がくせい",    // Romaji reading (required)
  "translation": "Học sinh", // Vietnamese translation (optional)
  "q": "Cách đọc của '学生' là gì?", // Question text (required)
  "a": ["がくせい", "がくぜい", "がっせい", "かくせい"], // Answer options array (required)
  "c": 0,                 // Correct answer index (required)
  "ex": "学生 (Học sinh). Học (学) + Sinh (生).", // Explanation (optional)
  "aTranslation": ["Học sinh", "(từ không có nghĩa)", "(từ không có nghĩa)", "(từ không có nghĩa)"] // Per-answer translations (optional)
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `word` | string | Yes | Japanese word/kanji |
| `romaji` | string | Yes | Romaji reading |
| `translation` | string | No | Vietnamese translation |
| `q` | string | Yes | Question text |
| `a` | array | Yes | Array of answer options (min 2) |
| `c` | number | Yes | Index of correct answer (0-based) |
| `ex` | string | No | Explanation text |
| `aTranslation` | array | No | Array of exactly 4 non-empty strings, positionally parallel to `a` — the translation shown under each choice button after answering (index i describes `a[i]`, including decoy answers, which should get a short gloss like "(từ không có nghĩa)" rather than being left blank) |

### QuestionSet Object

```javascript
{
  "id": "set-123456789",           // Unique set ID
  "name": "My Question Set",     // Set name
  "questions": [...],          // Array of Question objects
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "firestoreId": "abc123..."   // Optional: Firebase document ID
}
```

### Player State

```javascript
playerHP = 100        // Health points (0-100)
playerEXP = 0         // Total experience points
playerLevel = 1        // Player level (starts at 1)
playerCombo = 0        // Current combo streak
```

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `playerHP` | number | 100 | Health points |
| `playerEXP` | number | 0 | Experience points |
| `playerLevel` | number | 1 | Player level |
| `playerCombo` | number | 0 | Best combo achieved |

### Settings Object

```javascript
{
  "quizTimerEnabled": false,
  "quizTimeLimit": 20,
  "typeGameSpeed": "medium",
  "typeSpawnInterval": "medium",
  "typeHintsEnabled": true,
  "matchTimeLimit": 60,
  "scanlinesEnabled": false,
  "disableGameOver": false,
  "animationEnabled": true,
  "questionLimitEnabled": false,
  "questionLimit": 20,
  "shuffleAnswers": true,
  "matchPairCount": 6,
  "priority": {
    "enabled": true,
    "global": {
      "incorrect": 8,
      "timeSinceSeen": 3,
      "learning": 2,
      "slowResponse": 3
    },
    "perGame": {
      "quiz": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 },
      "listen": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 },
      "flash": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 },
      "match": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 },
      "type": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 },
      "write": { "enabled": null, "incorrect": 8, "timeSinceSeen": 3, "learning": 2, "slowResponse": 3 }
    }
  }
}
```

### Question Stats

```javascript
{
  "q-abc123": {
    "quiz": {
      "incorrect": 0,
      "correctCount": 5,
      "totalAttempts": 5,
      "lastSeen": "2024-01-01T00:00:00.000Z",
      "correctStreak": 5,
      "avgResponseTime": 3000,
      "slowCorrectCount": 0,
      "incorrectHistory": ["2024-01-01T00:00:00.000Z"]
    },
    "listen": { ... },
    "flash": { ... },
    "match": { ... },
    "type": { ... },
    "write": { ... }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `incorrect` | number | Number of incorrect answers |
| `correctCount` | number | Number of correct answers |
| `totalAttempts` | number | Total attempts |
| `lastSeen` | string | ISO timestamp of last attempt |
| `correctStreak` | number | Current correct streak |
| `avgResponseTime` | number | Average response time in ms |
| `slowCorrectCount` | number | Correct answers > 8 seconds |
| `incorrectHistory` | array | Array of ISO timestamps |

### Session History

```javascript
[
  {
    "id": "session-123456789-abc",
    "type": "quiz",
    "score": 150,
    "correct": 15,
    "wrong": 5,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
]
```

### Daily Streak

```javascript
{
  "currentStreak": 5,
  "lastPlayDate": "2024-01-01",
  "longestStreak": 10,
  "playDates": {
    "2024-01-01": { "minutes": 15, "games": ["quiz", "flash"] },
    "2024-01-02": { "minutes": 20, "games": ["quiz"] }
  }
}
```

---

## Storage API

### LocalStorage Keys

| Key | Type | Description |
|-----|------|-------------|
| `jq_question_sets` | array | All question sets |
| `jq_active_set` | string | Active set ID |
| `jq_hp` | number | Player HP |
| `jq_exp` | number | Player EXP |
| `jq_level` | number | Player level |
| `jq_combo` | number | Player combo |
| `jq_settings` | object | Game settings |
| `jq_question_stats` | object | Question statistics |
| `jq_session_history` | array | Session history |
| `jq_daily_streak` | object | Daily streak data |
| `jq_firebase_config` | object | Firebase configuration |

### Functions

#### saveToStorage()

Saves all game data to localStorage.

```javascript
saveToStorage();
```

**Effects:**
- Saves `questions`, `questionSets`, `activeSetId`
- Saves player state (HP, EXP, level, combo)
- Saves settings and stats

---

#### loadFromStorage()

Loads all game data from localStorage.

```javascript
loadFromStorage();
```

**Effects:**
- Loads question sets or creates default set
- Loads player state
- Initializes question stats

---

#### saveQuestionSetsToStorage()

Saves question sets to localStorage.

```javascript
saveQuestionSetsToStorage();
```

---

#### loadSettingsFromStorage()

Loads settings from localStorage.

```javascript
loadSettingsFromStorage();
```

---

#### saveSettingsToStorage()

Saves settings to localStorage.

```javascript
saveSettingsToStorage();
```

---

#### getActiveQuestionSet()

Returns the currently active question set.

```javascript
const set = getActiveQuestionSet();
// Returns: { id, name, questions: [...], createdAt, updatedAt }
```

**Returns:** QuestionSet object or null

---

#### syncQuestionsFromActiveSet()

Loads questions from the active set into the questions array.

```javascript
syncQuestionsFromActiveSet();
```

---

#### saveQuestionStats()

Saves question stats to localStorage.

```javascript
saveQuestionStats();
```

---

#### loadQuestionStats()

Loads question stats from localStorage.

```javascript
loadQuestionStats();
```

---

#### initQuestionStats(questionsArr)

Initializes stats for new questions.

```javascript
initQuestionStats(questions);
// questions: array of Question objects
```

---

#### saveSessionHistory()

Saves session history to localStorage.

```javascript
saveSessionHistory();
```

---

#### loadSessionHistory()

Loads session history from localStorage.

```javascript
loadSessionHistory();
```

---

#### saveDailyStreak()

Saves daily streak to localStorage.

```javascript
saveDailyStreak();
```

---

#### loadDailyStreak()

Loads daily streak from localStorage.

```javascript
loadDailyStreak();
```

---

## Question Set API

#### createQuestionSet(name, items)

Creates a new question set.

```javascript
const newSet = createQuestionSet("JLPT N5 Vocabulary", []);
// Returns: { id, name, questions, createdAt, updatedAt }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Set name |
| `items` | array | Array of Question objects |

**Returns:** Created QuestionSet object

---

#### renameQuestionSet(id, name)

Renames a question set.

```javascript
renameQuestionSet("set-123", "New Name");
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Set ID |
| `name` | string | New name |

---

#### deleteQuestionSet(id)

Deletes a question set.

```javascript
deleteQuestionSet("set-123");
// Shows confirmation dialog
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Set ID |

---

#### switchQuestionSet(id)

Switches to a different question set.

```javascript
switchQuestionSet("set-456");
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Set ID to switch to |

---

#### refreshQuestionSetUI()

Refreshes the question set selector UI.

```javascript
refreshQuestionSetUI();
```

---

## Data Manager API

#### parseImportPayload(raw)

Parses and validates imported JSON data.

```javascript
const questions = parseImportPayload('[{"word": "学生", ...}]');
// Throws Error if invalid
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `raw` | string | JSON string |

**Returns:** Array of Question objects

---

#### parseQuestionPayload(raw)

Parses and validates a single question.

```javascript
const question = parseQuestionPayload('{"word": "学生", ...}');
// Throws Error if invalid
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `raw` | string | JSON string |

**Returns:** Question object

---

#### applyImportReplace()

Replaces current questions with imported data.

```javascript
// Triggered from UI button
// Reads from import-textarea element
```

---

#### applyImportAppend()

Appends imported questions to current set.

```javascript
// Triggered from UI button
// Reads from import-textarea element
```

---

#### applyEditQuestion()

Updates a question at the specified index.

```javascript
// Triggered from UI button
// Uses importEditIndex global
```

---

#### clearData()

Clears all questions from current set.

```javascript
clearData();
// Shows confirmation dialog
```

---

#### exportData()

Exports questions as a downloadable JSON file.

```javascript
exportData();
// Downloads: jq_setname_YYYY-MM-DD.json
```

---

#### loadSampleData()

Loads sample data (SAMPLE_DATA).

```javascript
loadSampleData();
```

---

#### refreshDataPreview()

Refreshes the data preview table in screen-data.

```javascript
refreshDataPreview();
```

---

#### deleteQuestion(index)

Deletes a question at the specified index.

```javascript
deleteQuestion(0);
// Shows confirmation dialog
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `index` | number | Question index |

---

#### generateQuestionId(q)

Generates a unique ID for a question.

```javascript
const id = generateQuestionId(question);
// Returns: "q-abc123"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | object | Question object |

**Returns:** String ID

---

## Question Stats API

#### updateQuestionStats(questionIdOrIndex, gameType, isCorrect, responseTime)

Updates stats for a question.

```javascript
updateQuestionStats("q-abc123", "quiz", true, 3000);
// or
updateQuestionStats(0, "quiz", false, 5000);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `questionIdOrIndex` | string/number | Question ID or index |
| `gameType` | string | Game type: quiz, listen, flash, match, type, write |
| `isCorrect` | boolean | Whether answer was correct |
| `responseTime` | number | Response time in ms (optional) |

---

#### getPriorityScore(questionIndex, gameType, weights)

Calculates priority score for a question.

```javascript
const score = getPriorityScore(0, "quiz", { incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 });
// Returns: number
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `questionIndex` | number | Question index |
| `gameType` | string | Game type |
| `weights` | object | Priority weights |

**Returns:** Priority score (higher = more likely to be selected)

---

#### getPrioritizedDeck(questionsArr, gameType)

Returns a prioritized deck of questions.

```javascript
const deck = getPrioritizedDeck(questions, "quiz");
// Returns: array of Question objects, reordered by priority
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `questionsArr` | array | Array of questions |
| `gameType` | string | Game type |

**Returns:** Array of Question objects

---

#### computeGameTypeStats()

Computes stats for all game types.

```javascript
const stats = computeGameTypeStats();
// Returns: { quiz: { correct: 0, wrong: 0 }, ... }
```

**Returns:** Object with stats per game type

---

#### computeTotalStats()

Computes total stats across all game types.

```javascript
const { totalCorrect, totalWrong, gameTypeStats } = computeTotalStats();
```

**Returns:** { totalCorrect, totalWrong, gameTypeStats }

---

#### recordSession(type, score, correct, wrong)

Records a game session.

```javascript
recordSession("quiz", 150, 15, 5);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Game type |
| `score` | number | Score earned |
| `correct` | number | Correct answers |
| `wrong` | number | Wrong answers |

---

#### recordPlayTime(minutes)

Records play time for daily streak.

```javascript
recordPlayTime(15);
// minutes: number of minutes played
```

---

#### checkDailyStreak()

Checks and updates daily streak.

```javascript
checkDailyStreak();
// Called automatically after play time is recorded
```

---

## Settings API

#### renderSettingsScreen()

Renders the settings UI.

```javascript
renderSettingsScreen();
```

---

#### updateSettingsFromUI()

Updates settings from UI inputs.

```javascript
updateSettingsFromUI();
// Saves to localStorage
```

---

#### resetPlayerProgress()

Resets all player progress.

```javascript
resetPlayerProgress();
// Shows warning dialog - action cannot be undone
```

---

#### resetSettingsToDefault()

Resets all settings to default values.

```javascript
resetSettingsToDefault();
```

---

## Game Utilities API

#### shuffle(arr)

Shuffles an array (Fisher-Yates).

```javascript
const shuffled = shuffle([1, 2, 3, 4, 5]);
// Returns: array in random order
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `arr` | array | Array to shuffle |

**Returns:** Shuffled array (mutates original)

---

#### escapeHtml(value)

Escapes HTML special characters.

```javascript
const safe = escapeHtml("<script>alert('xss')</script>");
// Returns: "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | any | Value to escape |

**Returns:** Escaped string

---

#### getXpForLevel(level)

Calculates EXP required for a level.

```javascript
const xp = getXpForLevel(2);
// Returns: 500 (for level 2)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | number | Target level |

**Returns:** XP required

---

#### formatNumber(num)

Formats large numbers.

```javascript
formatNumber(1500);  // "1.5K"
formatNumber(1500000); // "1.5M"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `num` | number | Number to format |

**Returns:** Formatted string

---

#### normalizePlayerProgress()

Normalizes player progress and handles leveling.

```javascript
normalizePlayerProgress();
// Automatically called on saveToStorage()
```

---

#### shuffleAnswerOptions(q)

Shuffles answer options.

```javascript
const { options, correctIndex } = shuffleAnswerOptions(question);
// options: ["がくぜい", "がくせい", ...]
// correctIndex: 1
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | object | Question object |

**Returns:** { options: string[], correctIndex: number }

---

#### getWeights(gameType)

Gets priority weights for a game type.

```javascript
const weights = getWeights("quiz");
// Returns: { incorrect: 8, timeSinceSeen: 3, learning: 2, slowResponse: 3 }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `gameType` | string | Game type |

**Returns:** Weights object

---

#### getConfidenceLevel(correctStreak, effectiveIncorrect)

Gets confidence level based on stats.

```javascript
const level = getConfidenceLevel(5, 0.5);
// Returns: "mastered", "familiar", "learning", or "new"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `correctStreak` | number | Current streak |
| `effectiveIncorrect` | number | Effective incorrect count |

**Returns:** Level string

---

#### getEffectiveIncorrect(stats)

Calculates effective incorrect count with decay.

```javascript
const effective = getEffectiveIncorrect(stats);
// Returns: number with decay applied
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stats` | object | Question stats object |

**Returns:** Effective incorrect count

---

#### cleanIncorrectHistory(history)

Cleans old entries from incorrect history.

```javascript
const cleaned = cleanIncorrectHistory(history);
// Removes entries older than 30 days
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `history` | array | Array of timestamps |

**Returns:** Cleaned array

---

## Firebase API

### Configuration

```javascript
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "my-project",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "...",
  "measurementId": "..."
}
```

### Functions

#### loadFirebaseConfig()

Loads Firebase config from localStorage.

```javascript
const config = loadFirebaseConfig();
// Returns: config object or null
```

---

#### saveFirebaseConfig()

Saves Firebase config to localStorage.

```javascript
saveFirebaseConfig();
// Reads from UI form elements
```

---

#### initializeFirebase(config)

Initializes Firebase SDK.

```javascript
const initialized = initializeFirebase(config);
// Returns: boolean
```

---

#### backupQuestionSet()

Backs up current question set to Firebase.

```javascript
await backupQuestionSet();
// Shows toast on success/failure
```

---

#### importFirebaseSet(docId)

Imports a question set from Firebase.

```javascript
await importFirebaseSet("abc123");
// Shows toast on success/failure
```

---

#### showFirebaseSetsModal()

Shows Firebase sets management modal.

```javascript
await showFirebaseSetsModal();
// Fetches and displays all sets
```

---

#### deleteFirebaseSet(docId)

Deletes a question set from Firebase.

```javascript
await deleteFirebaseSet("abc123");
// Shows confirmation dialog
```

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `XP_PER_LEVEL` | 500 | Base XP per level |
| `LEVEL_XP_CURVE` | 1.2 | XP curve multiplier |
| `BASE_XP_REWARD` | 5 | Base XP reward |
| `SLOW_RESPONSE_THRESHOLD` | 8000 | Slow response threshold (ms) |
| `MAX_DAYS` | 30 | Max days for priority |
| `MAX_TIME_BONUS` | 50 | Max time bonus |
| `DECAY_RATE` | 0.85 | Incorrect decay rate |
| `MAX_HISTORY_DAYS` | 30 | Max history days |

---

## Game Types

| Type | Description |
|------|-------------|
| `quiz` | Multiple choice quiz |
| `listen` | Listening (TTS-based) |
| `flash` | Flashcard game |
| `match` | Match pairs game |
| `type` | Falling words typing |
| `write` | Writing/drawing |