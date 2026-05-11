# Evaluation harness

Empirical bench for the verification layer (V2) and tool-grounded answers.

## Files

- `queries.csv` — golden dataset of 50 prompts (numeric / causal / educational / mutation / sanity).
- `backend/scripts/eval-verification.ts` — runs each prompt against the live `/ai/chat` endpoint, captures verification metrics, writes a results CSV here.

## Workflow

### 0. Auth (pick ONE)

**Option A — mint a JWT locally (recommended)**. The Supabase JWT secret is
already in `backend/.env` (`SUPABASE_JWT_SECRET`) — same one our
`SupabaseAuthGuard` uses to verify user tokens. Add:

```
EVAL_USER_ID=<UUID of your test user>
EVAL_USER_EMAIL=test@example.com         # optional
EVAL_API_URL=http://localhost:4000/api/v1 # optional, default shown
```

Where do I get the user id?  After your first frontend login the user is
upserted into the `users` table; run `psql ... -c "SELECT id, email FROM
users;"` and copy your row's id.  Or look at the Supabase dashboard
(Authentication → Users → click your user → "User UID").

**Option B — paste a live access_token**. Grab it from the running
frontend (DevTools → Local Storage → `sb-<projectRef>-auth-token` JSON
→ `access_token`). Put it in `backend/.env` as `EVAL_TOKEN=eyJ...`.
Expires in ~1h, so option A is friendlier for repeat runs.

`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` will NOT work — those
are for the Supabase REST API, not for our app's bearer-token auth.

### 1. Baseline (verifier ON, default)

Make sure `backend/.env` does NOT have `AI_VERIFICATION_ENABLED=false`.
Restart backend.

```powershell
EVAL_TAG=with-verifier npm --prefix backend run eval:verifier
```

Writes `eval/results-with-verifier-<timestamp>.csv`.

### 2. No-verifier run (A/B comparison)

In `backend/.env` add:
```
AI_VERIFICATION_ENABLED=false
```

Restart backend, then:

```powershell
EVAL_TAG=no-verifier npm --prefix backend run eval:verifier
```

Writes `eval/results-no-verifier-<timestamp>.csv`.

The verification report is still computed and recorded — only the **retry/redraft behaviour** is disabled. So `verifTotal/verifVerified` columns reflect the model's first-shot accuracy, with no correction.

### 3. Compare

```powershell
# Open both CSVs side-by-side. Key columns to chart for the thesis:
# - hallucinationRate     (V2 effect)
# - retried               (how often the redraft fired)
# - latencyMs / costUsd   (overhead)
# - toolCallCount         (how many tools per query)
```

Open in Excel/LibreOffice/Python. Suggested charts:

1. **Bar**: mean `hallucinationRate` per `type` (numeric vs educational), ON vs OFF.
2. **Box**: `latencyMs` distribution, ON vs OFF.
3. **Stacked bar**: tool usage breakdown (`toolNames` split by `|`).
4. **Confusion matrix**: `agent` vs `type` — routing-accuracy proxy.

### 4. Summary metrics for the thesis

Put these in the "Експериментальні результати" chapter:

| Metric | Without verifier | With verifier | Δ |
|---|---|---|---|
| Mean hallucination rate | X.X% | Y.Y% | -Z.Z p.p. |
| Numeric queries fully grounded | A% | B% | +C p.p. |
| Mean latency p50 | X ms | Y ms | +Δ ms |
| Mean cost per query | $X | $Y | +$Δ |

## Tweaking the dataset

Edit `queries.csv` directly. Columns:
- `id` — stable identifier (Q01, Q02, ...).
- `type` — `numeric | causal | educational | mutation | sanity`.
- `query` — Ukrainian prompt as a user would type.
- `note` — short annotation for the analyst.

Re-run; results CSVs land beside this README.
