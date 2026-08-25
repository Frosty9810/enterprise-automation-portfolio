#!/usr/bin/env python3
"""comp_analysis.py — RE-04 CRE Deal Pipeline and Comp Analysis Automation.

Reference implementation of the comp normalization, statistical
outlier-flagging, and valuation-range logic described in the SOP
(Sections 12, 14, and 34). This module is the Python counterpart to the
n8n "statistical function node" (SOP Step 6) and the two Claude API
call sites (SOP Steps 4 and 7): field extraction from ambiguous source
formats, and draft underwriting narrative generation.

Design intent, matching the SOP:
    - CSV parsing follows the CoStar-style export columns shown in
      SOP Section 34's "Raw CoStar-style CSV row" example.
    - Outlier flagging applies the same 2-standard-deviation rule
      against the comp set's median cap rate (SOP Section 14),
      requiring at least MIN_COMPS_FOR_STATISTICS comps before the
      rule is considered statistically meaningful.
    - The valuation range is derived by applying the accepted comp
      set's median cap rate to the subject property's NOI, per the
      relationship enforced throughout the SOP (cap rate = NOI / value).
    - build_claude_prompt() constructs the exact narrative-generation
      prompt text that would be sent to the Anthropic Messages API
      (SOP Section 14, "Claude prompt construction — draft underwriting
      narrative generation"). No network call is required to run this
      script; an optional real API call is gated behind the
      ANTHROPIC_API_KEY environment variable, following a dry-run
      pattern so the module remains fully runnable offline.

This script has zero required third-party dependencies. It uses only
the Python 3 standard library (`csv`, `statistics`, `io`, `os`, `json`,
`urllib.request`).
"""

from __future__ import annotations

import csv
import io
import json
import os
import urllib.request
from dataclasses import dataclass, field
from statistics import median, stdev
from typing import Any, Optional

MIN_COMPS_FOR_STATISTICS = 5
OUTLIER_THRESHOLD_STD_DEV = 2.0

# Expected CoStar-style CSV export columns, matching the sample row in
# SOP Section 34, Appendix ("Raw CoStar-style CSV row").
EXPECTED_CSV_COLUMNS = [
    "Property Address",
    "City",
    "State",
    "Zip",
    "Sale Date",
    "Sale Price",
    "Building SF",
    "Price/SF",
    "Cap Rate",
    "NOI",
    "Building Class",
    "Occupancy %",
]


@dataclass
class Comp:
    """Canonical comp record used for outlier detection and valuation.

    Mirrors the SOP Section 14 dataclass and the canonical comp schema
    in SOP Section 34, trimmed to the fields required for the
    statistical and valuation logic in this module.
    """

    comp_id: str
    address: str
    city: str
    state: str
    zip_code: str
    transaction_date: str
    sale_price_usd: float
    building_sf: float
    price_per_sf: float
    cap_rate: float  # decimal, e.g., 0.062 for 6.2%
    noi_annual_usd: float
    building_class: str
    occupancy_pct: float
    is_outlier: bool = False


@dataclass
class ValuationRange:
    """Result of applying comp-derived cap rate statistics to a subject NOI."""

    subject_noi_annual_usd: float
    median_cap_rate: float
    cap_rate_stdev: float
    low_cap_rate: float
    high_cap_rate: float
    valuation_low_usd: float
    valuation_high_usd: float
    valuation_point_estimate_usd: float
    comp_count_used: int
    outlier_count_excluded: int


def _clean_currency(raw: str) -> float:
    """Convert a currency-formatted CSV cell (e.g. '$18,750,000') to float."""
    cleaned = raw.strip().replace("$", "").replace(",", "")
    if not cleaned:
        return 0.0
    return float(cleaned)


def _clean_percent(raw: str) -> float:
    """Convert a percent-formatted CSV cell (e.g. '6.10%') to decimal form."""
    cleaned = raw.strip().replace("%", "")
    if not cleaned:
        return 0.0
    return float(cleaned) / 100.0


def parse_costar_csv(csv_text: str) -> list[Comp]:
    """Parse a CoStar-style comp export CSV into a list of Comp records.

    Expects the column set defined in EXPECTED_CSV_COLUMNS, matching
    the sample export row documented in SOP Section 34. Cap rate and
    occupancy are stored as decimals (e.g., 0.061, 0.92); currency and
    numeric fields are coerced from their formatted string form.

    Args:
        csv_text: Raw CSV text (as would be read from an uploaded
            CoStar export file).

    Returns:
        A list of Comp objects, one per data row. `comp_id` is
        synthesized from the row's address and transaction date since
        CoStar exports do not include a stable comp identifier.

    Raises:
        ValueError: If the CSV header row does not contain the
            expected CoStar column set (SOP Section 17, Scenario 6 —
            template drift detection).
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise ValueError("CSV appears to be empty; no header row found.")

    missing = [c for c in EXPECTED_CSV_COLUMNS if c not in reader.fieldnames]
    if missing:
        raise ValueError(
            "CSV header does not match known CoStar template. "
            f"Missing columns: {missing}. This may indicate CoStar "
            "template drift (SOP Section 17, Scenario 6) — flag for "
            "Automation Architecture Lead review rather than broker "
            "correction."
        )

    comps: list[Comp] = []
    for row in reader:
        address = row["Property Address"].strip()
        transaction_date = _normalize_date(row["Sale Date"].strip())
        comp_id = f"cmp_{abs(hash((address, transaction_date))) % (10 ** 8):08d}"

        sale_price = _clean_currency(row["Sale Price"])
        building_sf = float(row["Building SF"].strip() or 0)
        price_per_sf = _clean_currency(row["Price/SF"])
        cap_rate = _clean_percent(row["Cap Rate"])
        noi_annual = _clean_currency(row["NOI"])
        occupancy_pct = _clean_percent(row["Occupancy %"])

        comps.append(
            Comp(
                comp_id=comp_id,
                address=address,
                city=row["City"].strip(),
                state=row["State"].strip(),
                zip_code=row["Zip"].strip(),
                transaction_date=transaction_date,
                sale_price_usd=sale_price,
                building_sf=building_sf,
                price_per_sf=price_per_sf,
                cap_rate=cap_rate,
                noi_annual_usd=noi_annual,
                building_class=row["Building Class"].strip(),
                occupancy_pct=occupancy_pct,
            )
        )
    return comps


def _normalize_date(raw_date: str) -> str:
    """Normalize a MM/DD/YYYY CoStar date string to ISO 8601 (YYYY-MM-DD)."""
    parts = raw_date.split("/")
    if len(parts) != 3:
        return raw_date  # leave as-is; downstream validation will flag it
    month, day, year = parts
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"


def flag_outlier_comps(comps: list[Comp]) -> dict[str, list[Comp]]:
    """Partition a comp set into accepted and flagged-for-review buckets.

    Applies the 2-standard-deviation rule against the comp set's cap
    rate median (SOP Section 14). Comps beyond the threshold are not
    discarded — they are routed to mandatory broker review before they
    can influence the valuation range (SOP Section 20, Manual Override).

    If fewer than MIN_COMPS_FOR_STATISTICS comps are present, the
    statistic is considered unstable and every comp is flagged for
    review rather than auto-accepted (SOP Section 14).

    Args:
        comps: Normalized comp records for a single subject property's
            comparison set.

    Returns:
        A dict with keys "accepted" and "flagged_for_review", each
        mapping to a list of Comp objects. Flagged comps also have
        their `is_outlier` attribute set to True as a side effect.
    """
    if len(comps) < MIN_COMPS_FOR_STATISTICS:
        for comp in comps:
            comp.is_outlier = False  # not a statistical outlier call, just insufficient data
        return {"accepted": [], "flagged_for_review": list(comps)}

    cap_rates = [c.cap_rate for c in comps]
    median_cap_rate = median(cap_rates)
    cap_rate_stdev = stdev(cap_rates)

    accepted: list[Comp] = []
    flagged: list[Comp] = []

    for comp in comps:
        deviation = abs(comp.cap_rate - median_cap_rate)
        if cap_rate_stdev > 0 and deviation > OUTLIER_THRESHOLD_STD_DEV * cap_rate_stdev:
            comp.is_outlier = True
            flagged.append(comp)
        else:
            comp.is_outlier = False
            accepted.append(comp)

    return {"accepted": accepted, "flagged_for_review": flagged}


def calculate_valuation_range(
    subject_noi_annual_usd: float,
    accepted_comps: list[Comp],
    flagged_comps: Optional[list[Comp]] = None,
) -> ValuationRange:
    """Derive a valuation range for the subject property from accepted comps.

    Applies the classic income-approach relationship (value = NOI / cap
    rate) using the accepted comp set's median cap rate as the point
    estimate, and one comp-set standard deviation on either side as the
    range bounds — mirroring the "cap rate derived" valuation range
    referenced in SOP Section 14's narrative prompt and the
    `CRE_Valuation_Range_Low__c` / `CRE_Valuation_Range_High__c`
    Salesforce fields in SOP Section 34.

    Args:
        subject_noi_annual_usd: The subject property's trailing annual
            net operating income.
        accepted_comps: Comps that passed outlier screening
            (`flag_outlier_comps()["accepted"]`).
        flagged_comps: Optional list of comps excluded as outliers, used
            only to report `outlier_count_excluded` for transparency.

    Returns:
        A ValuationRange with the median/low/high cap rates and the
        corresponding valuation bounds and point estimate.

    Raises:
        ValueError: If there are no accepted comps to derive a cap rate
            from, or if subject NOI is not positive.
    """
    if subject_noi_annual_usd <= 0:
        raise ValueError("subject_noi_annual_usd must be positive.")
    if not accepted_comps:
        raise ValueError(
            "No accepted comps available to derive a cap rate; cannot "
            "compute a valuation range. Per SOP Section 14, all comps "
            "should be surfaced for broker review in this case."
        )

    cap_rates = [c.cap_rate for c in accepted_comps]
    median_cap_rate = median(cap_rates)
    cap_rate_stdev = stdev(cap_rates) if len(cap_rates) > 1 else 0.0

    # A lower cap rate implies a higher valuation, so the "low" valuation
    # bound corresponds to the "high" cap rate bound, and vice versa.
    low_cap_rate = max(median_cap_rate - cap_rate_stdev, 0.001)
    high_cap_rate = median_cap_rate + cap_rate_stdev

    valuation_point_estimate = subject_noi_annual_usd / median_cap_rate
    valuation_low = subject_noi_annual_usd / high_cap_rate
    valuation_high = subject_noi_annual_usd / low_cap_rate

    return ValuationRange(
        subject_noi_annual_usd=subject_noi_annual_usd,
        median_cap_rate=round(median_cap_rate, 5),
        cap_rate_stdev=round(cap_rate_stdev, 5),
        low_cap_rate=round(low_cap_rate, 5),
        high_cap_rate=round(high_cap_rate, 5),
        valuation_low_usd=round(valuation_low, 2),
        valuation_high_usd=round(valuation_high, 2),
        valuation_point_estimate_usd=round(valuation_point_estimate, 2),
        comp_count_used=len(accepted_comps),
        outlier_count_excluded=len(flagged_comps or []),
    )


def build_claude_prompt(subject: dict[str, Any], comps: list[dict[str, Any]]) -> str:
    """Construct the Claude API prompt for draft underwriting narrative generation.

    This is the real prompt text that would be sent as the `content` of
    a user message in an Anthropic Messages API request (see
    `call_claude_for_narrative()` below for the gated live-call path).
    It mirrors `build_narrative_prompt()` in SOP Section 14, adapted to
    accept plain dicts so it composes directly with `Comp`/`ValuationRange`
    instances converted via `dataclasses.asdict()` or an equivalent dict.

    Args:
        subject: Subject property attributes, e.g. address, asset
            class, building class, and NOI.
        comps: Accepted comparable records (outliers already excluded)
            as plain dicts, plus the computed valuation range under a
            "valuation_range" key or passed separately by the caller.

    Returns:
        The full prompt string ready to send as the Claude API request
        body's message content.
    """
    valuation_range = subject.get("valuation_range", {})
    subject_for_prompt = {k: v for k, v in subject.items() if k != "valuation_range"}

    return f"""You are drafting the valuation narrative section of a commercial
real estate offering memorandum. This is a DRAFT for broker review — do not
present conclusions as final. Write in the register of an institutional
underwriting memo: precise, comp-supported, no marketing language.

Subject property:
{json.dumps(subject_for_prompt, indent=2, default=str)}

Accepted comparable set (outliers already excluded):
{json.dumps(comps, indent=2, default=str)}

Computed valuation range (cap rate derived):
{json.dumps(valuation_range, indent=2, default=str)}

Write a 3-5 paragraph narrative that:
1. States the valuation range and the cap rate assumption driving it.
2. Explicitly references which comps support the range and why they were
   judged comparable (asset class, submarket, building class, recency).
3. Notes any comps that were excluded as statistical outliers and the
   reason (cap rate deviation), without asserting they were factually wrong.
4. Ends with a one-line flag: "Draft narrative — pending broker review and
   approval prior to distribution."

Do not state the valuation range as final or guaranteed."""


def call_claude_for_narrative(prompt: str) -> str:
    """Optionally call the real Anthropic Messages API to generate the narrative.

    This function is gated behind the ANTHROPIC_API_KEY environment
    variable, following a dry-run pattern: if the key is not set, it
    returns a clearly-labeled placeholder instead of making a network
    call, so `comp_analysis.py` remains fully runnable standalone with
    zero required credentials (per the portfolio's Real Build Artifacts
    standard).

    Args:
        prompt: The prompt text produced by `build_claude_prompt()`.

    Returns:
        The narrative text returned by Claude, or a placeholder string
        if ANTHROPIC_API_KEY is not set.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return (
            "[DRY RUN — ANTHROPIC_API_KEY not set. No live API call made. "
            "Set ANTHROPIC_API_KEY to generate a real narrative via the "
            "Anthropic Messages API.]"
        )

    request_body = json.dumps(
        {
            "model": "claude-sonnet-4-5",
            "max_tokens": 1024,
            "temperature": 0.4,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        url="https://api.anthropic.com/v1/messages",
        data=request_body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload["content"][0]["text"]


# ---------------------------------------------------------------------------
# Self-test / demo data
# ---------------------------------------------------------------------------

SAMPLE_COSTAR_CSV = """Property Address,City,State,Zip,Sale Date,Sale Price,Building SF,Price/SF,Cap Rate,NOI,Building Class,Occupancy %
233 Harrison St,Oakland,CA,94607,03/14/2026,"$18,750,000",60000,"$312.50",6.10%,"$1,143,750",B,92%
480 Grand Ave,Oakland,CA,94610,02/02/2026,"$12,400,000",42000,"$295.24",6.30%,"$781,200",B,88%
100 Broadway,Oakland,CA,94607,01/18/2026,"$9,800,000",34000,"$288.24",6.05%,"$592,900",B,95%
1200 Clay St,Oakland,CA,94612,11/30/2025,"$21,300,000",71000,"$300.00",5.95%,"$1,267,350",A,97%
55 Frank Ogawa Plaza,Oakland,CA,94612,10/09/2025,"$15,600,000",52000,"$300.00",6.20%,"$967,200",B,90%
2100 Franklin St,Oakland,CA,94612,08/11/2025,"$26,750,000",84000,"$318.45",6.15%,"$1,645,125",A,94%
50 Jack London Sq,Oakland,CA,94607,06/19/2025,"$16,900,000",56000,"$301.79",6.25%,"$1,056,250",B,93%
900 Alice St,Oakland,CA,94607,09/22/2025,"$7,200,000",26000,"$276.92",11.80%,"$849,600",C,78%
"""
# Deliberate outlier baked into the sample set above:
#   - "900 Alice St": cap rate of 11.80% is far above the group median
#     (Class C, lower occupancy, plausible distress sale — this is the
#     row the self-test below expects to see flagged for broker review).
#   All seven other rows cluster tightly between 5.95% and 6.30% and are
#   expected to be accepted into the valuation set.

SUBJECT_PROPERTY = {
    "address": "300 Lakeside Dr, Oakland, CA 94612",
    "asset_class": "office",
    "building_class": "B",
    "building_sf": 58000,
    "noi_annual_usd": 1_050_000,
}


def main() -> None:
    """Run the self-test: parse sample comps, flag outliers, compute a
    valuation range, and print the results and a sample Claude prompt.
    """
    print("=" * 78)
    print("RE-04 Comp Analysis — Self-Test Run")
    print("=" * 78)

    comps = parse_costar_csv(SAMPLE_COSTAR_CSV)
    print(f"\nParsed {len(comps)} comps from sample CoStar CSV export.\n")

    partitioned = flag_outlier_comps(comps)
    accepted = partitioned["accepted"]
    flagged = partitioned["flagged_for_review"]

    print(f"Accepted comps ({len(accepted)}):")
    for c in accepted:
        print(f"  - {c.comp_id}  {c.address:<24} cap_rate={c.cap_rate:.4f}")

    print(f"\nFlagged-for-review comps ({len(flagged)}):")
    for c in flagged:
        print(f"  - {c.comp_id}  {c.address:<24} cap_rate={c.cap_rate:.4f}  [OUTLIER]")

    valuation = calculate_valuation_range(
        subject_noi_annual_usd=SUBJECT_PROPERTY["noi_annual_usd"],
        accepted_comps=accepted,
        flagged_comps=flagged,
    )

    print("\nComputed valuation range for subject property:")
    print(f"  Subject NOI:              ${valuation.subject_noi_annual_usd:,.2f}")
    print(f"  Median cap rate (comps):  {valuation.median_cap_rate:.4%}")
    print(f"  Cap rate std dev:         {valuation.cap_rate_stdev:.4%}")
    print(f"  Valuation point estimate: ${valuation.valuation_point_estimate_usd:,.2f}")
    print(
        f"  Valuation range:          "
        f"${valuation.valuation_low_usd:,.2f}  -  ${valuation.valuation_high_usd:,.2f}"
    )
    print(f"  Comps used:               {valuation.comp_count_used}")
    print(f"  Outliers excluded:        {valuation.outlier_count_excluded}")

    subject_for_prompt = dict(SUBJECT_PROPERTY)
    subject_for_prompt["valuation_range"] = {
        "low_usd": valuation.valuation_low_usd,
        "high_usd": valuation.valuation_high_usd,
        "median_cap_rate": valuation.median_cap_rate,
    }
    accepted_comp_dicts = [
        {
            "comp_id": c.comp_id,
            "address": c.address,
            "building_class": c.building_class,
            "cap_rate": c.cap_rate,
            "price_per_sf": c.price_per_sf,
            "transaction_date": c.transaction_date,
        }
        for c in accepted
    ]
    prompt = build_claude_prompt(subject_for_prompt, accepted_comp_dicts)

    print("\n" + "=" * 78)
    print("Claude narrative-generation prompt (constructed, not sent):")
    print("=" * 78)
    print(prompt)

    print("\n" + "=" * 78)
    print("Optional live Claude call result:")
    print("=" * 78)
    print(call_claude_for_narrative(prompt))


if __name__ == "__main__":
    main()
