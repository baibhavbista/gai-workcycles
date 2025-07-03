## ⏩ Quick Summary

We will store **three granularities of embeddings**—field‑level, cycle‑level, session‑level—in a local **LanceDB** index that sits next to the existing SQLite data.

1. **Field vectors** (one per free‑text answer) – high‑precision Q\&A.
2. **Cycle vectors** (one per 40‑min cycle) – mid‑scope context.
3. **Session vectors** (one per summarised session) – big‑picture insights.

All embedding, retrieval and analytics workflows are orchestrated by **LangGraph** graphs; plain functions would work, but LangGraph gives us retries, batching, and unified tracing.
A lightweight **`embed_jobs`** queue in SQLite guarantees that vectors are generated once the user is back online—even across app restarts.
Total cost: ≪ \$0.05 / user / year and < 1 GB of disk after many years of data.

---

# Embedding Design Document

### 1  Why all three levels?

| Retrieval need                                                                               | Fulfilled by                    | Reason                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| **Pin‑point answers** ("When did I note *Zoom lag* as a hazard?")                            | **Field vectors**               | Highest recall; filterable by `field='review_distractions'` etc. |
| **Cycle‑scope reasoning** ("Find cycles where energy started *Low* but goal still finished") | **Cycle vectors**               | One chunk per 40‑min story → fewer LLM tokens.                   |
| **Big‑picture trends** ("Compare last week’s objectives to this month’s")                    | **Session vectors**             | Captures intent + outcome in one summary.                        |
| **Fast coarse‑to‑fine search**                                                               | Session → Cycle → Field cascade | Narrows candidates before fine re‑rank.                          |

> **Cost & storage** *(embedding‑3‑small, \$0.02 / M tokens)*
>
> | Sessions / day | Tokens / month | \$ / month | \$ / year | Disk after 1 y\* |
> | -------------- | -------------- | ---------- | --------- | ---------------- |
> | 2              | 52 k           | \$0.001    | \$0.012   | ≈ 80 MB          |
> | 5              | 143 k          | \$0.003    | \$0.035   | ≈ 220 MB         |
>
> \* 384‑d float32 vectors.

---

### 2  Pitfalls & Mitigations

| Pitfall                                          | Mitigation                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Session vector surfaces for a narrow field query | Store `level` metadata; start search at `level='field'`, cascade downward only if empty. |
| Duplicate hits at multiple levels                | Deduplicate by `cycle_id` / `session_id` before sending docs to the LLM.                 |
| Session chunk too long                           | Summarise with GPT‑4o‑mini (< 150 words) **then** embed.                                 |
| Schema or model upgrade                          | Add `version` column; worker rebuilds rows where `version` < current.                    |

---

### 3  Building each vector

| Level       | Text to embed                               | When created                                         | OpenAI calls     |
| ----------- | ------------------------------------------- | ---------------------------------------------------- | ---------------- |
| **Field**   | Answer text only                            | After user saves the field *(or batch at cycle end)* | 1 / answer       |
| **Cycle**   | `START:` plan values + `END:` review values | On **cycle end** save                                | 1 / cycle        |
| **Session** | GPT‑generated 150‑word summary              | On **session debrief** save                          | 1 chat + 1 embed |

---

### 4  LanceDB schema & config

```ts
const tbl = await db.openOrCreate("embeddings", {
  id:         "string",              // "field:<row>:<col>" | "cycle:<id>" | "session:<id>"
  level:      "string",              // field | cycle | session
  session_id: "string",
  cycle_id:   "string",              // NULL for sessions
  column:     "string",              // exact SQL column name
  field_label:"string",              // human‑readable question label
  vec:        lancedb.vector(384),
  text:       "string",
  version:    "int",
  created_at: "timestamp"
});
```

*Batch size:* `BATCH = 96` inputs per embed request.
(batch size keeps us under the 16 MB request limit and amortises latency)

---

### 5  Retriever pattern

```ts
async function vectorQuery(queryVec, userIntent, k = 8) {
  const pref = /overall|trend|summary/i.test(userIntent)
             ? ["session","cycle","field"]   // coarse first
             : ["field","cycle","session"];  // fine first

  for (const lv of pref) {
    const hits = await tbl.search(queryVec)
                          .where({ level: lv })
                          .limit(k)
                          .execute();
    if (hits.length) return dedupe(hits);
  }
  return [];
}
```

---

### 6  Exact flow trigger points

| UX event                        | Jobs inserted into `embed_jobs`      |
| ------------------------------- | ------------------------------------ |
| **Field save** (online/offline) | 1 *field* job per free‑text column   |
| **Cycle End save**              | Remaining field jobs + 1 *cycle* job |
| **Session Debrief save**        | 1 *session* job (summary + embed)    |

The LangGraph **embed‑worker** drains `embed_jobs` whenever network connectivity is present; resumable across app restarts.

---

### 7  LangGraph vs LangChain

* **Embedding**: direct SDK calls inside LangGraph nodes—**no LangChain** needed.
* **QA / chat / analytics**: higher‑level LangGraph graphs reuse the same LanceDB helper funcs.

---

### 8  Offline‑robust pipeline

1. **`embed_jobs` table** stores text + status (`pending`, `done`, `error`).
2. Background **LangGraph worker**: `FetchPending → CheckConnectivity → EmbedBatch → UpsertVectors → mark done → loop`.
3. UI badge shows pending / syncing status.
4. No embeddings available = QA disabled; acceptable for MVP.

---

### 9  Field‑label mapping (column ⇢ question)

Store the mapping in code or a small SQL table; used **inside the task‑generation node** of the Field‑Embed graph.

```ts
export const FIELD_LABEL = {
  // sessions
  plan_objective:       "What am I trying to accomplish?",
  plan_importance:      "Why is this important and valuable?",
  plan_done_definition: "How will I know this is complete?",
  plan_hazards:         "Any risks / hazards? (Potential distractions, procrastination, etc.)",
  plan_concrete:        "Is this concrete / measurable or subjective / ambiguous?",
  plan_misc_notes:      "Anything else noteworthy?",
  review_accomplishments: "What did I get done in this session?",
  review_comparison:      "How did this compare to my normal work output?",
  review_obstacles:       "Did I get bogged down? Where?",
  review_successes:       "What went well? How can I replicate this in the future?",
  review_takeaways:       "Any other takeaways? Lessons to share with others?",
  // cycles
  plan_goal:          "What am I trying to accomplish this cycle?",
  plan_first_step:    "How will I get started?",
  plan_hazards_cycle: "Any hazards present?",
  review_status:      "Completed cycle's target?",
  review_noteworthy:  "Anything noteworthy?",
  review_distractions:"Any distractions?",
  review_improvement: "Things to improve for next cycle?"
};
```

*Usage inside graph*

```ts
const tasks = [];
for (const [col, val] of Object.entries(row)) {
  if (!val || !FIELD_LABEL[col]) continue;
  tasks.push({
    id: `${table}:${row.id}:${col}`,
    text: val,
    meta: {
      level: "field",
      column: col,
      field_label: FIELD_LABEL[col],
      session_id: row.session_id ?? row.id,
      cycle_id:   table === "cycles" ? row.id : null
    }
  });
}
```

---

### 10  Future LangGraph workflows enabled

| Stage         | Workflow                              | Vectors used    |
| ------------- | ------------------------------------- | --------------- |
| **Today**     | Ask‑my‑Cycles chat                    | field & cycle   |
|               | Quick charts (SQL only)               | —               |
| **Near‑term** | Nightly distraction clustering        | field           |
|               | Energy ↔ task correlation             | cycle           |
|               | Weekly digest email (summary + chart) | session         |
| **Later**     | Real‑time distraction nudger          | field           |
|               | Anomaly detector on morale trends     | numeric + cycle |

---

### 11  Other considerations

* **Versioning:** bump `version` when model or chunking changes; worker deletes old rows lazily.
* **Security:** OpenAI key encrypted via `safeStorage` → stored in `openai.key`.
* **Tests:** insert fake sessions → run backfill → assert counts in LanceDB match design ratios.
* **Limits:** Keep session summaries ≤ 200 tokens to avoid performance cliffs in cosine space.

---

### 12  Testing checklist

1. Seed 3 sessions × 4 cycles × full answers.
2. Run backfill → expect 40 field vectors, 4 cycle vectors, 1 session vector.
3. Toggle offline mode, create another cycle → ensure it lands in `embed_jobs`.
4. Kill and relaunch app → worker resumes, embeds after network returns.
5. Ask "What went well last session?" → system retrieves review\_successes fields.