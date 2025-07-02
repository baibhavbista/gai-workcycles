## ⏩ Quick Summary

We will store **three granularities of embeddings**—field-level, cycle-level, session-level—in a local **LanceDB** index that sits next to the existing SQLite data.
This hierarchy:

1. **Field vectors** (one per free-text answer) – high-precision Q\&A.
2. **Cycle vectors** (one per 40-min cycle) – mid-scope context.
3. **Session vectors** (one per summarised session) – big-picture insights.

All embedding, retrieval and analytics workflows are orchestrated by **LangGraph** graphs; plain functions would work, but LangGraph gives us retries, batching, and unified tracing.
A lightweight **`embed_jobs`** queue in SQLite guarantees that vectors are generated once the user is back online—even across app restarts.
Total cost: ≪ \$0.05 / user / year and < 1 GB of disk after many years of data.

The remainder of this document is written for an implementation LLM; you can follow each numbered section independently.

---

# Embedding Design Document

### 1  Why all three levels?

| Retrieval need                                                                               | Fulfilled by                    | Reason                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| **Pin-point answers** (“When did I note *Zoom lag* as a hazard?”)                            | **Field vectors**               | Highest recall; filterable by `field='hazards'`. |
| **Cycle-scope reasoning** (“Find cycles where energy started *Low* but goal still finished”) | **Cycle vectors**               | One chunk per 40-min story → fewer LLM tokens.   |
| **Big-picture trends** (“Compare last week’s objectives to this month’s”)                    | **Session vectors**             | Captures intent + outcome in one summary.        |
| **Fast coarse-to-fine search**                                                               | Session ➜ Cycle ➜ Field cascade | Narrows candidates before fine re-rank.          |

#### Cost & storage envelope (embedding-3-small, \$0.02 / M tokens)

| Usage            | Tokens / month | \$ / month | \$ / year | Disk after a year\* |
| ---------------- | -------------- | ---------- | --------- | ------------------- |
| 2 sessions / day | 52 k           | \$0.001    | \$0.012   | ≈ 80 MB             |
| 5 sessions / day | 143 k          | \$0.003    | \$0.035   | ≈ 220 MB            |

\* Assumes 384-d float32 vectors.

---

### 2  Pitfalls & mitigations

| Pitfall                                          | Mitigation                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Session vector shows up for a narrow field query | Always attach `level` metadata and start search at `level='field'`; fallback cascade. |
| Duplicate hits at multiple levels                | Deduplicate by `cycle_id` / `session_id` before sending docs to LLM.                  |
| Session text too long for clean semantics        | Summarise with GPT-4o-mini (< 150 words) **then** embed the summary.                  |
| Schema evolution / model upgrade                 | Store `version` column in LanceDB; drop & rebuild old versions lazily.                |

---

### 3  Building each vector

| Level       | Text to embed                                                       | When created                                                        | OpenAI calls          |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| **Field**   | Raw free-text answer (no question)                                  | Immediately after the field is saved (or on cycle end, if batching) | 1 per answer          |
| **Cycle**   | `START: goal … hazards … energy=High …\nEND: status=Half …`         | Right after **cycle end** form                                      | 1 per cycle           |
| **Session** | GPT-generated 150-word summary covering objective, hazards, outcome | After **session debrief** saved                                     | 1 chat call + 1 embed |

---

### 4  LanceDB schema & config

```ts
const tbl = await db.openOrCreate("embeddings", {
  id:         "string",              // "field:<row>:<col>" | "cycle:<id>" | "session:<id>"
  level:      "string",              // field | cycle | session
  session_id: "string",
  cycle_id:   "string",              // NULL for sessions
  field:      "string",              // only for level='field'
  vec:        lancedb.vector(384),
  text:       "string",
  version:    "int",                 // embedding strategy / model
  created_at: "timestamp"
});
```

*Configuration*

```js
// batch size keeps us under the 16 MB request limit and amortises latency
const BATCH = 96;
```

---

### 5  Retriever pattern

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

1. **Filter numeric columns first** (e.g. `energy_start=0`) if present.
2. Deduplicate; pass ≤ 6 docs to GPT-4o-mini for final answer.

---

### 6  Exact points in the UX flow

| User action                                   | Embedding jobs created                 |
| --------------------------------------------- | -------------------------------------- |
| **Save a field** inside a cycle form (online) | 1 `field` job inserted immediately \*  |
| **Cycle End** save                            | Remaining field jobs + 1 `cycle` job   |
| **Session Debrief** save                      | 1 `session` summary chat-and-embed job |
| \*If offline, all jobs simply queue (see §8). |                                        |

---

### 7  Do we use LangGraph for embedding?

Yes—each trigger above calls a **tiny LangGraph sub-graph**:

```
makeChunks → embedBatch → upsertVectors
         ↖─ error(loop w/ backoff)
```

Benefits: automatic retry, batching, trace IDs in a single framework shared with QA/chat flows.

No **LangChain** needed for embeddings; we call `openai.embeddings.create` directly.

---

### 8  Offline-robust pipeline

| Component                       | Responsibility                                                            |
| ------------------------------- | ------------------------------------------------------------------------- |
| **`embed_jobs` table (SQLite)** | Durable queue → `pending` / `done` / `error`, stores raw text.            |
| **Background LangGraph worker** | `FetchPending → CheckConnectivity → Embed → Upsert → mark done → loop`.   |
| **App launch**                  | Starts worker with `run_forever: true`; resumes where it left off.        |
| **UI badge**                    | Shows “N embeddings pending (offline)” / spinner when syncing.            |
| **Fallback (optional)**         | Offline users can skip QA until sync; no local embedder required for MVP. |

---

### 9  Workflows enabled (now & future)

| Stage         | Example LangGraph workflow                                              | Uses which vectors              |
| ------------- | ----------------------------------------------------------------------- | ------------------------------- |
| **MVP**       | *Ask-my-Cycles* chat: clarify → retrieve → answer → critique            | field & cycle                   |
|               | *Chart hours last 14 d*: SQL sum → chart (no vectors)                   | —                               |
| **Near-term** | Distraction taxonomy miner: nightly cluster hazards fields              | field                           |
|               | Energy-correlate finder: parse energy & task keywords → correlate       | cycle                           |
|               | Weekly digest email: fetch last 7 d session vectors → summarise → chart | session                         |
| **Later**     | Real-time nudger: detect frequent distraction typed in START form       | field (fresh)                   |
|               | Anomaly detector: Z-score of energy vs 28 d rolling mean                | numeric columns + cycle vectors |

---

### 10  Other considerations

* **Versioning:** bump `version` when model or chunking changes; worker deletes old rows lazily.
* **Security:** OpenAI key encrypted via `safeStorage` → stored in `openai.key`.
* **Tests:** insert fake sessions → run backfill → assert counts in LanceDB match design ratios.
* **Limits:** Keep session summaries ≤ 200 tokens to avoid performance cliffs in cosine space.

---

*End of document – everything above can be handed to an automation LLM to generate code skeletons, migrations and LangGraph definitions.*
