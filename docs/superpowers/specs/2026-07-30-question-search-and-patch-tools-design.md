# Design: `search_questions` + `patch_question` MCP tools

## Problem

The `mcp-server` MCP server (`mcp-server/src/index.js` + `mcp-server/src/questions-repo.js`)
already lets an author update a single question via `update_question(setId, index, question)`
without touching the rest of the set. Two gaps remain:

1. **No way to find a question.** To get the `setId`/`index` needed by `update_question`,
   the author has to call `get_question_set` and manually scan the full JSON (up to 400
   questions in `n5-core`).
2. **No partial update.** `update_question` requires the full 7-field question object even
   to change one field (e.g. just `translation`), so the author must first fetch the
   question, edit locally, then send the whole object back.

## Goals

- Add a `search_questions` tool to find questions by keyword across one or all sets.
- Add a `patch_question` tool to update only specific fields of one or more questions in a
  single call, atomically.
- Do not change the behavior/contract of any existing tool (`list_question_sets`,
  `get_question_set`, `create_question_set`, `delete_question_set`, `add_question`,
  `update_question`, `delete_question`, `publish`).

## Non-goals

- No fuzzy/ranked search — simple case-insensitive substring match is sufficient for
  question sets of this size (≤ a few hundred questions).
- No pagination/result cap on `search_questions` — set sizes are small enough that this
  isn't needed yet (YAGNI; revisit if sets grow much larger).

## Design

### `search_questions`

**Input schema:**
```js
{
  keyword: z.string().min(1),
  setId: z.string().optional()
}
```

**Behavior** (`questions-repo.js: searchQuestions(keyword, setId)`):
- If `setId` given: search only that set; error if the set doesn't exist (reuse
  `findEntry` + existing "Question set not found" error convention).
- If `setId` omitted: search every set listed in the manifest.
- Match: lowercase the keyword and the haystack, substring match (`String#includes`).
  Haystack per question = `word`, `romaji`, `translation`, `q`, `ex`, and all 4 elements
  of `a`.
- No file writes.

**Output:** array of `{ setId, index, question }` for every match, e.g.:
```json
[{ "setId": "n5-core", "index": 42, "question": { "word": "食べる", ... } }]
```
This gives the author everything needed to call `patch_question` or `update_question`
next without a separate `get_question_set` round-trip.

### `patch_question`

**Input schema:**
```js
{
  setId: z.string(),
  patches: z.array(z.object({
    index: z.number().int().min(0),
    fields: z.object(questionShape).partial().strict()
      .refine(f => Object.keys(f).length > 0, 'fields must include at least one field to update')
  })).min(1)
}
```
`.strict()` rejects unknown keys at the schema layer (clear zod error) rather than
silently dropping them.

**Behavior** (`questions-repo.js: patchQuestion(setId, patches)`), atomic:
1. Look up the set once (error if `setId` doesn't exist).
2. For every patch: validate `index` is in range, merge `fields` onto a **shallow copy**
   of the existing question at that index, run the merged object through the existing
   `validateQuestion`.
3. If **any** patch fails (index out of range, merged object fails validation) — throw
   immediately with an error identifying which patch/index failed, and **write nothing**.
4. Only after every patch validates: apply all merged questions to `set.questions`, set
   `updatedAt`, write the set file once, update the manifest entry once.

Each patch merges onto the **original** stored question, not onto results of earlier
patches in the same batch — patches in one call are independent overwrites, not a
pipeline. (Edge case: two patches targeting the same `index` in one call — the second
one wins, since both merge from the same original and get applied in array order.)

**Output:** `{ updated: [index, index, ...] }` (indexes actually patched, in input order).

### Registration (`index.js`)

Follow the existing pattern exactly: `server.registerTool('search_questions', { title, description, inputSchema }, guarded(...))` and same for `patch_question`. No changes to any existing `registerTool` call.

## Testing

Add to `mcp-server/test/questions-repo.test.js` (same temp-dir + `assert` style as existing tests):

- `search_questions` finds a match by `word`, by `translation`, and by an answer-choice
  string in `a[]`.
- `search_questions` with `setId` only searches that set; errors on unknown `setId`.
- `search_questions` with no `setId` searches across multiple sets and tags results with
  the correct `setId`.
- `search_questions` returns `[]` for a keyword with no matches.
- `patch_question` updates only the given field(s), leaving the rest of the question and
  the rest of the set untouched.
- `patch_question` applies multiple patches (different indexes) in one call.
- `patch_question` is atomic: when one patch in a batch is invalid (bad index or field),
  the whole call throws and the set file on disk is unchanged (verify by re-reading the
  file after the throw).
- `patch_question` rejects an unknown field name and an out-of-range `c` value inside
  `fields`.

If `mcp-server/test/mcp-server.smoke.test.js` enumerates registered tools by name, add
`search_questions` and `patch_question` there too.

## Files touched

- `mcp-server/src/questions-repo.js` — add `searchQuestions`, `patchQuestion`, export both.
- `mcp-server/src/index.js` — register the two new tools.
- `mcp-server/test/questions-repo.test.js` — new test cases.
- `mcp-server/test/mcp-server.smoke.test.js` — add to tool list if applicable.
- `README.md` — mention the two new tools in the "Adding Your Own Questions" section.
