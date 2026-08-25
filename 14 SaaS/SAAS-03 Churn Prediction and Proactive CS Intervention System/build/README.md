# SAAS-03 Build Artifacts

Real, working reference implementation backing [`../SOP.md`](../SOP.md), per [`49 Internal Standards`](../../../49%20Internal%20Standards/README.md) Section 9 ("Real Build Artifacts"). Nothing in this folder is pseudo-code — every file is structurally valid and, where applicable, has actually been executed.

## Files

### `churn_model.py`

A runnable Python script implementing the churn scoring model described in SOP.md Section 14. Uses the exact 11-feature engagement-decay feature list and the exact `GradientBoostingClassifier` hyperparameters (`n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=42`) cited in the SOP.

Contains:
- `generate_synthetic_training_data()` — builds 500 synthetic accounts with a real (non-random) relationship between engagement-decay features and churn label, so the model has genuine signal to learn.
- `train_model()` — fits a real `GradientBoostingClassifier` from `scikit-learn`.
- `score_account()` — returns churn probability plus the top 3 contributing factors. Tries real SHAP (`shap.TreeExplainer`) first; if the `shap` package isn't installed, falls back to a feature-importance-based approximation and says so explicitly rather than crashing.
- `build_intervention_prompt()` — constructs the exact JSON context payload that would be sent to Claude for playbook generation (mirrors SOP.md's `build_playbook_prompt`). Returns a string; no live API call required.
- `generate_playbook_via_claude()` — optional real call to the Anthropic Messages API, only attempted if `ANTHROPIC_API_KEY` is set in the environment. Skipped safely otherwise.
- An `if __name__ == "__main__":` block that trains the model on synthetic data and scores three example accounts (low/medium/high risk), printing probability, top factors, routing decision, and a prompt preview for each.

### `n8n-workflow.json`

A valid, importable n8n workflow (verified via `json.load`). Implements the pipeline from SOP.md Section 12:

`Nightly Schedule Trigger (scheduleTrigger, 0 1 * * *)` → `Pull Active Account Roster (postgres)` → `Pull Engagement Feature Snapshot (postgres)` → `Batch Accounts (splitInBatches, 200/batch)` → `Call scikit-learn Scoring Service (httpRequest → http://scoring-service.internal/score)` → `Flatten Scored Accounts (code)` → `Above Churn Probability Threshold? (if, 0.6)` →
- **Yes branch** → `Above ARR Human-Touch Threshold? (if, $18,000)` →
  - **Yes** → `Claude API - Generate Intervention Playbook (httpRequest → api.anthropic.com/v1/messages)` → `Close CRM - Create Task (HTTP)` → `Log Intervention Record (postgres)` + `Log Score + Action to Postgres (postgres)` → `Slack - Log Notification`
  - **No** → `HubSpot - Enroll Automated Sequence (httpRequest)` → `Log Score + Action to Postgres`
- **No branch** → `Log Score (Below Threshold, No Action) (postgres)`

All nodes use real n8n core node types (`n8n-nodes-base.scheduleTrigger`, `n8n-nodes-base.postgres`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.splitInBatches`, `n8n-nodes-base.code`, `n8n-nodes-base.if`, `n8n-nodes-base.slack`) with realistic `parameters` (real SQL, real n8n expression syntax, real retry/backoff config matching SOP.md Section 18). Credential fields reference standard n8n credential types (`postgres`, `httpHeaderAuth`, `httpBasicAuth`, `hubspotOAuth2Api`, `slackApi`) with placeholder IDs for the operator to fill in.

### `schema.sql`

Real PostgreSQL 14+ DDL for the `churn_intel` schema: `active_accounts`, `feature_snapshots`, `score_history`, `score_overrides`, `interventions`, `outcome_feedback`, `audit_log`, `model_registry`, and `job_completion_flags`. Matches the tables referenced throughout SOP.md (Sections 8, 12, 14, 20, 23, 31). Uses `CREATE TYPE ... IF NOT EXISTS` guards (via `DO $$` blocks, since Postgres lacks native `CREATE TYPE IF NOT EXISTS`), foreign keys, check constraints matching the SOP's data validation rules (Section 16), and indexes on the columns the pipeline filters/joins on.

## How to run

### 1. Python model (`churn_model.py`)

```bash
pip install numpy scikit-learn shap
python3 churn_model.py
```

`shap` is **optional** — the script runs end-to-end with just `numpy` and `scikit-learn`. If `shap` is not installed, it prints a notice and falls back to a feature-importance-based approximation for the top-3-factors output instead of crashing.

If you want to see a real Claude-generated playbook rather than just the constructed prompt, additionally run:

```bash
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-your-real-key
python3 churn_model.py
```

This is entirely optional; the script's core training/scoring/prompt-construction path never requires network access or a key.

### 2. n8n workflow (`n8n-workflow.json`)

1. In your n8n instance: **Workflows → Import from File** → select `n8n-workflow.json`.
2. Create/attach credentials for each placeholder:
   - `PLACEHOLDER_POSTGRES_CRED_ID` → a Postgres credential pointing at your `churn_intel` schema (see `schema.sql`).
   - `PLACEHOLDER_SCORING_SERVICE_TOKEN_CRED_ID` → an HTTP Header Auth credential for your internal scoring microservice (the FastAPI wrapper around `churn_model.py`'s `train_model`/`score_account` functions).
   - `PLACEHOLDER_ANTHROPIC_API_KEY_CRED_ID` → HTTP Header Auth credential with header `x-api-key: sk-ant-...` for the Claude Messages API.
   - `PLACEHOLDER_CLOSE_CRM_API_KEY_CRED_ID` → Close CRM API key.
   - `PLACEHOLDER_HUBSPOT_OAUTH_CRED_ID` → HubSpot Private App OAuth2 token.
   - `PLACEHOLDER_SLACK_CRED_ID` → Slack Bot token with access to `#cs-automation-log`.
3. Update the two hardcoded URLs (`http://scoring-service.internal/score` and the HubSpot workflow-enrollment endpoint's `PLACEHOLDER_WORKFLOW_ID`) to match your actual deployment.
4. Leave `active: false` until you've run at least one manual test execution against staging data (per SOP.md Section 30, shadow-mode rollout).

### 3. Database schema (`schema.sql`)

```bash
psql -U postgres -d your_database -f schema.sql
```

Executes cleanly against a fresh PostgreSQL 14+ database — creates the `churn_intel` schema, its enum types, and all nine tables with their constraints and indexes.

## Required credentials / environment variables for a real deployment

| Credential | Used by | Notes |
|---|---|---|
| PostgreSQL connection string | n8n Postgres nodes, scoring service | SSL enforced, scoped service role per SOP.md Section 6 |
| Scoring service internal token | n8n → FastAPI scoring endpoint | Internal network only, never exposed publicly |
| `ANTHROPIC_API_KEY` | Claude API calls (n8n node + optional `churn_model.py` call) | Never hardcoded; store in n8n's credential vault per SOP.md Section 24 |
| Close CRM API key | Close task creation | Scoped to the CS team's pipeline |
| HubSpot Private App token | Automated re-engagement enrollment | v3 workflow-enrollment scope |
| Slack Bot token | `#cs-automation-log` / `#cs-automation-alerts` notifications | Per SOP.md Section 22 |

---
*Part of the Enterprise Automation Portfolio. See [`../SOP.md`](../SOP.md) and root [README.md](../../../README.md) for navigation.*
