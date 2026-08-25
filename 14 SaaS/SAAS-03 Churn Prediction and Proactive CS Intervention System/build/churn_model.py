"""
churn_model.py — Reference implementation of the SAAS-03 churn scoring model.

This is the runnable, self-contained counterpart to the narrative pipeline
described in SOP.md Section 14 ("Automation Logic"). It uses the exact
engagement-decay feature list defined there and reproduces the same
GradientBoostingClassifier hyperparameters cited in the SOP.

Designed to run end-to-end with only `numpy` and `scikit-learn` installed.
SHAP is optional — if it is not installed, the script falls back to a
feature-importance-based approximation and prints a clear notice rather
than crashing.

Run directly:
    python3 churn_model.py

Dependencies (required):
    numpy
    scikit-learn

Dependencies (optional, for real SHAP explanations):
    shap

Dependencies (optional, only used if ANTHROPIC_API_KEY is set — never
required for the script to run end-to-end):
    anthropic
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier

# ---------------------------------------------------------------------------
# Feature list — must match SOP.md Section 14 exactly.
# ---------------------------------------------------------------------------

FEATURE_COLUMNS: list[str] = [
    "login_frequency_delta",
    "feature_usage_delta",
    "seat_utilization_rate",
    "seat_utilization_delta",
    "support_ticket_sentiment_score",
    "support_ticket_volume_delta",
    "nps_trend",
    "payment_failure_flag",
    "contract_days_to_renewal",
    "account_tenure_days",
    "plan_tier_encoded",
]

# Thresholds — must match SOP.md Section 13 / Section 31 exactly.
CHURN_PROBABILITY_THRESHOLD: float = 0.6
HUMAN_TOUCH_ARR_THRESHOLD: float = 18000.0  # top ~35% of accounts by ARR, per Sec. 13

# Index positions of the three engagement-delta features SHAP-fallback logic
# treats as "engagement" drivers for the synthetic label relationship.
_ENGAGEMENT_DELTA_IDX = {
    "login_frequency_delta": 0,
    "feature_usage_delta": 1,
    "seat_utilization_delta": 3,
}


@dataclass
class ScoreResult:
    """Structured result of scoring a single account."""

    churn_probability: float
    top_factors: list[dict[str, Any]]
    explanation_method: str
    low_confidence_flag: bool = False
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Synthetic training data
# ---------------------------------------------------------------------------


def generate_synthetic_training_data(
    n_accounts: int = 500, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    """Generate synthetic feature data and churn labels for training/demo.

    Reproduces the 11-column feature vector from SOP.md Section 14
    (`FEATURE_COLUMNS`). The label is not random: churn probability is
    constructed as a logistic function of a weighted combination of the
    engagement-decay features, so lower login/feature/seat deltas, negative
    sentiment, negative NPS trend, and payment failures all push accounts
    toward churn — mirroring the causal story in SOP.md Section 2. This
    ensures the trained model has real, non-trivial signal to learn rather
    than fitting to noise.

    Args:
        n_accounts: Number of synthetic accounts to generate.
        seed: Random seed for reproducibility.

    Returns:
        A tuple ``(X, y)`` where ``X`` has shape ``(n_accounts, 11)`` in the
        column order of ``FEATURE_COLUMNS``, and ``y`` is a binary churn
        label array of shape ``(n_accounts,)``.
    """
    rng = np.random.default_rng(seed)

    login_frequency_delta = rng.normal(loc=0.0, scale=0.35, size=n_accounts)
    feature_usage_delta = rng.normal(loc=0.0, scale=0.35, size=n_accounts)
    seat_utilization_rate = np.clip(rng.beta(a=5, b=2, size=n_accounts), 0.05, 1.0)
    seat_utilization_delta = rng.normal(loc=0.0, scale=0.15, size=n_accounts)
    support_ticket_sentiment_score = np.clip(
        rng.normal(loc=0.15, scale=0.4, size=n_accounts), -1.0, 1.0
    )
    support_ticket_volume_delta = rng.normal(loc=0.0, scale=0.5, size=n_accounts)
    nps_trend = rng.normal(loc=0.0, scale=1.2, size=n_accounts)
    payment_failure_flag = rng.binomial(n=1, p=0.08, size=n_accounts).astype(float)
    contract_days_to_renewal = rng.integers(low=1, high=365, size=n_accounts).astype(float)
    account_tenure_days = rng.integers(low=15, high=1800, size=n_accounts).astype(float)
    plan_tier_encoded = rng.integers(low=0, high=3, size=n_accounts).astype(float)  # 0=starter,1=growth,2=enterprise

    X = np.column_stack(
        [
            login_frequency_delta,
            feature_usage_delta,
            seat_utilization_rate,
            seat_utilization_delta,
            support_ticket_sentiment_score,
            support_ticket_volume_delta,
            nps_trend,
            payment_failure_flag,
            contract_days_to_renewal,
            account_tenure_days,
            plan_tier_encoded,
        ]
    )

    # Ground-truth churn "logit" — a weighted linear combination reflecting
    # the qualitative causal story in SOP.md Section 2 (engagement decay,
    # negative sentiment, negative NPS trend, payment failure all raise risk;
    # tenure and imminent renewal slightly modulate it).
    logit = (
        -2.6 * login_frequency_delta
        - 2.2 * feature_usage_delta
        - 1.1 * seat_utilization_delta
        - 1.6 * support_ticket_sentiment_score
        + 0.5 * support_ticket_volume_delta
        - 0.55 * nps_trend
        + 1.8 * payment_failure_flag
        - 0.0009 * contract_days_to_renewal
        - 0.0004 * account_tenure_days
        + 0.15  # baseline intercept
    )
    churn_probability_true = 1.0 / (1.0 + np.exp(-logit))
    noise = rng.normal(loc=0.0, scale=0.08, size=n_accounts)
    y = (rng.uniform(size=n_accounts) < np.clip(churn_probability_true + noise, 0.0, 1.0)).astype(int)

    return X, y


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------


def train_model(X: np.ndarray, y: np.ndarray) -> GradientBoostingClassifier:
    """Fit a GradientBoostingClassifier on the supplied feature matrix and labels.

    Hyperparameters match the production configuration cited in SOP.md
    Section 14 (`n_estimators=300, max_depth=3, learning_rate=0.05,
    subsample=0.8, random_state=42`).

    Args:
        X: Feature matrix, shape ``(n_samples, 11)``, columns matching
            ``FEATURE_COLUMNS``.
        y: Binary churn labels, shape ``(n_samples,)``.

    Returns:
        The fitted classifier.
    """
    model = GradientBoostingClassifier(
        n_estimators=300,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X, y)
    return model


# ---------------------------------------------------------------------------
# Scoring + explainability
# ---------------------------------------------------------------------------


def _fallback_feature_importance_factors(
    model: GradientBoostingClassifier, feature_vector: np.ndarray
) -> list[dict[str, Any]]:
    """Approximate top-3 contributing factors when SHAP is unavailable.

    Combines the model's global `feature_importances_` with the direction
    implied by whether this account's feature value sits above or below the
    training-set median-ish reference point (0.0 for zero-centered deltas).
    This is a coarse approximation — it is NOT a substitute for real SHAP
    values, and is explicitly labeled as such in the returned dict.
    """
    importances = model.feature_importances_
    ranked_idx = np.argsort(importances)[::-1][:3]

    factors = []
    for idx in ranked_idx:
        feature_name = FEATURE_COLUMNS[idx]
        value = float(feature_vector[idx])
        # Heuristic direction: for delta/sentiment/nps features, negative
        # value increases risk; for payment_failure_flag, 1.0 increases risk.
        if feature_name == "payment_failure_flag":
            direction = "increases_risk" if value >= 0.5 else "decreases_risk"
        elif feature_name in (
            "login_frequency_delta",
            "feature_usage_delta",
            "seat_utilization_delta",
            "support_ticket_sentiment_score",
            "nps_trend",
        ):
            direction = "increases_risk" if value < 0 else "decreases_risk"
        else:
            direction = "unclear"
        factors.append(
            {
                "feature": feature_name,
                "importance_score": round(float(importances[idx]), 4),
                "direction": direction,
            }
        )
    return factors


def score_account(model: GradientBoostingClassifier, feature_vector: np.ndarray) -> dict[str, Any]:
    """Score a single account and return churn probability + top contributing factors.

    Tries to compute real SHAP values via `shap.TreeExplainer`. If the
    `shap` package is not installed, falls back to a feature-importance-based
    approximation (see `_fallback_feature_importance_factors`) and includes a
    clear notice in the returned dict rather than raising an exception.

    Args:
        model: A fitted GradientBoostingClassifier.
        feature_vector: 1-D array of length 11, ordered per `FEATURE_COLUMNS`.

    Returns:
        A dict with keys: `churn_probability`, `top_factors`,
        `explanation_method` (`"shap"` or `"feature_importance_fallback"`),
        and `notice` (str or None).
    """
    X_row = feature_vector.reshape(1, -1)
    churn_probability = float(model.predict_proba(X_row)[0, 1])

    notice: str | None = None
    try:
        import shap  # type: ignore

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_row)
        # scikit-learn binary classifiers via TreeExplainer on a
        # GradientBoostingClassifier return a single array of shape (1, n_features).
        row_shap = np.asarray(shap_values)[0]
        ranked_idx = np.argsort(np.abs(row_shap))[::-1][:3]
        top_factors = [
            {
                "feature": FEATURE_COLUMNS[j],
                "shap_value": round(float(row_shap[j]), 4),
                "direction": "increases_risk" if row_shap[j] > 0 else "decreases_risk",
            }
            for j in ranked_idx
        ]
        explanation_method = "shap"
    except ImportError:
        notice = (
            "shap package not installed — falling back to a "
            "feature-importance-based approximation. Install `shap` for "
            "real per-account SHAP explanations (`pip install shap`)."
        )
        top_factors = _fallback_feature_importance_factors(model, feature_vector)
        explanation_method = "feature_importance_fallback"
    except Exception as exc:  # pragma: no cover - defensive: never crash scoring
        notice = f"SHAP explanation failed unexpectedly ({exc!r}); using fallback."
        top_factors = _fallback_feature_importance_factors(model, feature_vector)
        explanation_method = "feature_importance_fallback"

    return {
        "churn_probability": round(churn_probability, 4),
        "top_factors": top_factors,
        "explanation_method": explanation_method,
        "notice": notice,
    }


# ---------------------------------------------------------------------------
# Claude intervention-playbook prompt construction
# ---------------------------------------------------------------------------

PLAYBOOK_SYSTEM_PROMPT = """You are generating a Customer Success intervention
playbook for a Customer Success Manager (CSM) at a B2B SaaS company. You will
be given a churn risk score, the top statistical drivers of that risk (SHAP
values or an approximation), a summary of recent support ticket sentiment,
and a usage history snapshot. Produce a playbook grounded ONLY in the
provided data — do not speculate beyond it. If the provided context is
incomplete, say so explicitly rather than inventing detail. Output valid
JSON matching the schema provided."""


def build_intervention_prompt(account: dict[str, Any], score_result: dict[str, Any]) -> str:
    """Construct the prompt text sent to Claude for playbook generation.

    Mirrors `build_playbook_prompt` in SOP.md Section 14: the context is
    scoped to derived signals only (SHAP/importance factors, a sentiment
    summary string, coarse usage aggregates, account metadata) — no raw
    support-ticket text and no end-user PII, per SOP.md Section 24.

    This function only builds and returns the prompt string. It does not
    require network access or an API key to run.

    Args:
        account: Account metadata dict, expected keys include `account_id`,
            `arr`, `plan_tier`, `csm_owner_id`.
        score_result: Output of `score_account`.

    Returns:
        A JSON-encoded string suitable for use as the `user` message content
        in an Anthropic Messages API call, alongside `PLAYBOOK_SYSTEM_PROMPT`
        as the `system` prompt.
    """
    context = {
        "account_id": account.get("account_id"),
        "plan_tier": account.get("plan_tier"),
        "arr": account.get("arr"),
        "churn_probability": score_result["churn_probability"],
        "top_factors": score_result["top_factors"],
        "explanation_method": score_result["explanation_method"],
        "support_ticket_sentiment_summary": account.get(
            "support_ticket_sentiment_summary",
            "No recent support ticket activity on file.",
        ),
        "usage_history_snapshot": account.get(
            "usage_history_snapshot",
            {
                "login_frequency_delta": account.get("login_frequency_delta"),
                "feature_usage_delta": account.get("feature_usage_delta"),
                "seat_utilization_rate": account.get("seat_utilization_rate"),
            },
        ),
        "output_schema": {
            "talking_points": "list of 3-5 specific, data-grounded talking points",
            "recommended_reengagement_feature": "string, one specific product feature to re-anchor the account on",
            "ideal_outreach_channel": "string, one of: email, phone, in-app message, scheduled call",
            "sentiment_summary": "string, 2-3 sentence summary of recent support interactions",
            "confidence_caveat": "string or null, populated if input context was incomplete",
        },
    }
    return json.dumps(context, indent=2)


def generate_playbook_via_claude(account: dict[str, Any], score_result: dict[str, Any]) -> dict[str, Any] | None:
    """Optionally call the real Anthropic Messages API to generate a playbook.

    Gated behind the `ANTHROPIC_API_KEY` environment variable. Returns None
    (rather than raising) if the key is not set, the `anthropic` package is
    not installed, or the call fails — this keeps the script runnable
    end-to-end with zero live credentials, per the SOP's fallback posture
    (Section 19).

    Args:
        account: Account metadata dict.
        score_result: Output of `score_account`.

    Returns:
        Parsed playbook dict, or None if the call was skipped/failed.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic  # type: ignore

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=800,
            system=PLAYBOOK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_intervention_prompt(account, score_result)}],
        )
        text = response.content[0].text
        return json.loads(text)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Demo / self-test entrypoint
# ---------------------------------------------------------------------------


def _print_account_report(label: str, account: dict[str, Any], model: GradientBoostingClassifier) -> None:
    feature_vector = np.array([account[col] for col in FEATURE_COLUMNS], dtype=float)
    score_result = score_account(model, feature_vector)
    prompt = build_intervention_prompt(account, score_result)

    print(f"\n{'=' * 70}")
    print(f"{label}: {account['account_id']}  (ARR=${account['arr']:,.0f}, plan_tier={account['plan_tier']})")
    print(f"{'=' * 70}")
    print(f"Churn probability: {score_result['churn_probability']:.4f}")
    print(f"Explanation method: {score_result['explanation_method']}")
    if score_result["notice"]:
        print(f"Notice: {score_result['notice']}")
    print("Top contributing factors:")
    for factor in score_result["top_factors"]:
        magnitude_key = "shap_value" if "shap_value" in factor else "importance_score"
        print(f"  - {factor['feature']}: {magnitude_key}={factor[magnitude_key]}, direction={factor['direction']}")

    above_prob_threshold = score_result["churn_probability"] > CHURN_PROBABILITY_THRESHOLD
    above_arr_threshold = account["arr"] > HUMAN_TOUCH_ARR_THRESHOLD
    if above_prob_threshold and above_arr_threshold:
        routing = "HUMAN-TOUCH: Claude playbook -> Close CRM task"
    elif above_prob_threshold:
        routing = "AUTOMATED: HubSpot re-engagement sequence"
    else:
        routing = "NO ACTION: below churn-probability threshold"
    print(f"Routing decision (Sec. 13 decision tree): {routing}")

    print("Intervention prompt preview (first 400 chars):")
    print(prompt[:400] + ("..." if len(prompt) > 400 else ""))

    playbook = generate_playbook_via_claude(account, score_result)
    if playbook is not None:
        print("Live Claude playbook generated:")
        print(json.dumps(playbook, indent=2)[:400])
    else:
        print("(ANTHROPIC_API_KEY not set or anthropic package unavailable — "
              "skipping live playbook call; prompt above is what would be sent.)")


if __name__ == "__main__":
    print("Generating synthetic training data (500 accounts)...")
    X_train, y_train = generate_synthetic_training_data(n_accounts=500, seed=42)
    print(f"  Feature matrix shape: {X_train.shape}")
    print(f"  Churn label rate: {y_train.mean():.2%}")

    print("\nTraining GradientBoostingClassifier...")
    churn_model = train_model(X_train, y_train)
    train_accuracy = churn_model.score(X_train, y_train)
    print(f"  Training accuracy: {train_accuracy:.4f}")
    print(f"  Feature importances (top 3): "
          f"{sorted(zip(FEATURE_COLUMNS, churn_model.feature_importances_), key=lambda t: -t[1])[:3]}")

    # Three example accounts constructed to be low / medium / high risk.
    low_risk_account = {
        "account_id": "acct_low_risk_001",
        "arr": 24000.0,
        "plan_tier": "growth",
        "csm_owner_id": "csm_042",
        "login_frequency_delta": 0.22,
        "feature_usage_delta": 0.18,
        "seat_utilization_rate": 0.82,
        "seat_utilization_delta": 0.05,
        "support_ticket_sentiment_score": 0.55,
        "support_ticket_volume_delta": -0.10,
        "nps_trend": 0.8,
        "payment_failure_flag": 0.0,
        "contract_days_to_renewal": 210.0,
        "account_tenure_days": 640.0,
        "plan_tier_encoded": 1.0,
        "support_ticket_sentiment_summary": "Recent tickets are routine feature questions; no escalations.",
    }

    medium_risk_account = {
        "account_id": "acct_medium_risk_002",
        "arr": 15000.0,
        "plan_tier": "growth",
        "csm_owner_id": "csm_017",
        "login_frequency_delta": -0.15,
        "feature_usage_delta": -0.20,
        "seat_utilization_rate": 0.48,
        "seat_utilization_delta": -0.08,
        "support_ticket_sentiment_score": -0.10,
        "support_ticket_volume_delta": 0.30,
        "nps_trend": -0.4,
        "payment_failure_flag": 0.0,
        "contract_days_to_renewal": 45.0,
        "account_tenure_days": 380.0,
        "plan_tier_encoded": 1.0,
        "support_ticket_sentiment_summary": "Mild frustration in two recent tickets about onboarding a new team member.",
    }

    high_risk_account = {
        "account_id": "acct_high_risk_003",
        "arr": 32000.0,
        "plan_tier": "enterprise",
        "csm_owner_id": "csm_005",
        "login_frequency_delta": -0.62,
        "feature_usage_delta": -0.58,
        "seat_utilization_rate": 0.21,
        "seat_utilization_delta": -0.35,
        "support_ticket_sentiment_score": -0.70,
        "support_ticket_volume_delta": 0.95,
        "nps_trend": -1.8,
        "payment_failure_flag": 1.0,
        "contract_days_to_renewal": 18.0,
        "account_tenure_days": 900.0,
        "plan_tier_encoded": 2.0,
        "support_ticket_sentiment_summary": "Multiple escalations in the last 30 days citing missed SLAs; one ticket mentions evaluating alternatives.",
    }

    _print_account_report("LOW RISK EXAMPLE", low_risk_account, churn_model)
    _print_account_report("MEDIUM RISK EXAMPLE", medium_risk_account, churn_model)
    _print_account_report("HIGH RISK EXAMPLE", high_risk_account, churn_model)

    print(f"\n{'=' * 70}")
    print("Done. Ran end-to-end using only numpy + scikit-learn"
          " (+ shap if installed, + anthropic only if ANTHROPIC_API_KEY is set).")
    print(f"{'=' * 70}")
