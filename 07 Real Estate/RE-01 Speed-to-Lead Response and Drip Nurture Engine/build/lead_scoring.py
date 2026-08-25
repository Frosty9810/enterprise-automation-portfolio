"""
lead_scoring.py

Reference implementation of the RE-01 Speed-to-Lead lead scoring and
fuzzy-deduplication logic described in SOP.md (Section 12, Step 3;
Section 14, Automation Logic).

This module is dependency-free (Python 3 stdlib only) and is designed to
be run directly as a self-test — no external credentials, network calls,
or database connections are required to exercise the core logic.

Covers:
  1. Fuzzy dedup matching (email exact-normalize + phone E.164 normalize,
     using `difflib.SequenceMatcher` as a stand-in for the production
     `pg_trgm` similarity function used in PostgreSQL).
  2. Lead scoring: source weight + price band weight + form completeness.
  3. Tier assignment and hot-queue escalation logic.
  4. A `__main__` block that runs all of the above against four
     hardcoded sample leads (Zillow, Realtor.com, and two website-form
     shapes) and prints the computed results to stdout.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Optional

# ---------------------------------------------------------------------------
# Scoring weights (mirrors SOP Section 14 exactly)
# ---------------------------------------------------------------------------

SOURCE_WEIGHTS: dict[str, int] = {"zillow": 30, "realtor_com": 25, "brokerage_site": 20}
PRICE_BAND_WEIGHTS: dict[str, int] = {
    "under_300k": 10,
    "300k-500k": 15,
    "500k-750k": 20,
    "750k-plus": 25,
}

# Dedup similarity thresholds (SOP Section 12, Step 3)
EMAIL_SIMILARITY_THRESHOLD = 0.85
PHONE_SIMILARITY_THRESHOLD = 0.92


@dataclass
class CanonicalLead:
    """A lead normalized into the canonical schema (SOP Section 12)."""

    source: str
    price_band: str
    form_completeness: float  # 0.0-1.0, share of optional fields populated
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    last_touch_at: Optional[datetime] = None
    engagement_event_at: Optional[datetime] = None
    score: int = field(default=0)
    tier: str = field(default="unscored")


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def normalize_email(raw_email: Optional[str]) -> Optional[str]:
    """Trim and lowercase an email address. Returns None if input is falsy."""
    if not raw_email:
        return None
    return raw_email.strip().lower()


def normalize_phone_e164(raw_phone: Optional[str]) -> Optional[str]:
    """Normalize a US phone number to E.164 (+1XXXXXXXXXX).

    Strips all non-digit characters, then handles the 10-digit and
    11-digit-with-leading-1 cases. Returns None for anything else
    (e.g. international numbers), consistent with the SOP's domestic-only
    scope (Section 29, Testing Procedure).
    """
    if not raw_phone:
        return None
    digits = re.sub(r"\D", "", raw_phone)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


def parse_price(raw_price) -> Optional[int]:
    """Cast a price value (int, float, or currency-formatted string) to int."""
    if raw_price is None:
        return None
    if isinstance(raw_price, (int, float)):
        return int(raw_price)
    cleaned = re.sub(r"[^0-9.]", "", str(raw_price))
    if not cleaned:
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def price_to_band(price: Optional[int]) -> str:
    """Bucket a numeric price into the canonical price-band enum."""
    if price is None:
        return "unknown"
    if price < 300_000:
        return "under_300k"
    if price < 500_000:
        return "300k-500k"
    if price < 750_000:
        return "500k-750k"
    return "750k-plus"


# ---------------------------------------------------------------------------
# Fuzzy dedup matching
# ---------------------------------------------------------------------------


def string_similarity(a: Optional[str], b: Optional[str]) -> float:
    """Return a 0.0-1.0 similarity ratio between two strings.

    Stand-in for PostgreSQL's `pg_trgm` `similarity()` function used in
    production (see schema.sql). `difflib.SequenceMatcher` is a stdlib
    trigram-adjacent approach suitable for local dev/test without a
    database connection.
    """
    if a is None or b is None:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


@dataclass
class DedupResult:
    """Result of a fuzzy-dedup lookup against an existing lead store."""

    matched: bool
    matched_lead_index: Optional[int]
    email_similarity: float
    phone_similarity: float
    reason: str


def find_duplicate(
    candidate_email: Optional[str],
    candidate_phone: Optional[str],
    existing_leads: list[dict],
) -> DedupResult:
    """Fuzzy-match a candidate lead's normalized email/phone against a list
    of existing lead records (each a dict with 'email' and 'phone' keys,
    already normalized).

    Mirrors the production Postgres query in schema.sql:
        WHERE similarity(email, $1) > 0.85 OR similarity(phone, $2) > 0.92

    Phone requires a higher threshold because, once normalized to E.164,
    two numbers belonging to the same person should match almost exactly;
    email allows more tolerance for minor typos/casing (SOP Section 12).
    """
    candidate_email_norm = normalize_email(candidate_email)
    candidate_phone_norm = normalize_phone_e164(candidate_phone)

    best_match_index: Optional[int] = None
    best_email_sim = 0.0
    best_phone_sim = 0.0

    for idx, existing in enumerate(existing_leads):
        email_sim = string_similarity(candidate_email_norm, existing.get("email"))
        phone_sim = string_similarity(candidate_phone_norm, existing.get("phone"))

        is_match = email_sim > EMAIL_SIMILARITY_THRESHOLD or phone_sim > PHONE_SIMILARITY_THRESHOLD
        if is_match and (email_sim > best_email_sim or phone_sim > best_phone_sim):
            best_match_index = idx
            best_email_sim = email_sim
            best_phone_sim = phone_sim

    if best_match_index is not None:
        reason = (
            "email_similarity_above_threshold"
            if best_email_sim > EMAIL_SIMILARITY_THRESHOLD
            else "phone_similarity_above_threshold"
        )
        return DedupResult(
            matched=True,
            matched_lead_index=best_match_index,
            email_similarity=round(best_email_sim, 4),
            phone_similarity=round(best_phone_sim, 4),
            reason=reason,
        )

    return DedupResult(
        matched=False,
        matched_lead_index=None,
        email_similarity=round(best_email_sim, 4),
        phone_similarity=round(best_phone_sim, 4),
        reason="no_match_above_threshold",
    )


# ---------------------------------------------------------------------------
# Lead scoring (mirrors the n8n Code node logic in the workflow export
# and SOP Section 14 exactly)
# ---------------------------------------------------------------------------


def score_lead(lead: CanonicalLead) -> int:
    """Compute a 0-100 lead score from source quality, price band, and
    form completeness.

    Fails safe: any missing weight lookup defaults to the lowest tier
    weight rather than raising, so a scoring gap never blocks enrollment
    (SOP Section 14, Section 21).
    """
    source_score = SOURCE_WEIGHTS.get(lead.source, 15)
    price_score = PRICE_BAND_WEIGHTS.get(lead.price_band, 10)
    completeness_score = round(lead.form_completeness * 25)
    return min(100, source_score + price_score + completeness_score)


def assign_tier(score: int) -> str:
    """Map a numeric score to a drip campaign tier."""
    if score >= 70:
        return "fast_track"
    if score >= 40:
        return "standard"
    return "long_cycle"


def should_escalate_to_hot(lead: CanonicalLead, now: Optional[datetime] = None) -> bool:
    """A lead escalates to the hot queue only if it engaged within 24 hours
    of its most recent outbound touch (SOP Section 14, Section 13
    Decision Tree) — engagement outside that window is treated as passive
    re-scoring, not urgent handoff.
    """
    now = now or datetime.now(timezone.utc)
    if lead.engagement_event_at is None or lead.last_touch_at is None:
        return False
    return (now - lead.last_touch_at) <= timedelta(hours=24) and lead.engagement_event_at >= lead.last_touch_at


def build_canonical_lead_from_raw(raw: dict) -> CanonicalLead:
    """Normalize a raw source-specific payload dict into a CanonicalLead.

    Supports the three representative shapes from SOP Section 12:
    Zillow Premier Agent, Realtor.com, and a generic brokerage website
    form submission.
    """
    source = raw.get("_source", "brokerage_site")

    if source == "zillow":
        person = raw.get("person", {})
        first_name = person.get("firstName")
        last_name = person.get("lastName")
        email = normalize_email(person.get("emailAddress"))
        phone = normalize_phone_e164(person.get("phoneNumber"))
        price = parse_price(raw.get("listPrice"))
        optional_fields = [raw.get("propertyAddress"), raw.get("listingId"), price, raw.get("message")]
    elif source == "realtor_com":
        contact = raw.get("contact", {})
        listing = raw.get("listing", {})
        full_name = contact.get("full_name", "") or ""
        parts = full_name.strip().split()
        first_name = parts[0] if parts else None
        last_name = " ".join(parts[1:]) if len(parts) > 1 else None
        email = normalize_email(contact.get("email"))
        phone = normalize_phone_e164(contact.get("phone"))
        price = parse_price(listing.get("price"))
        address = ", ".join(filter(None, [listing.get("address_line1"), listing.get("address_line2")]))
        optional_fields = [address or None, listing.get("mls_id"), price, raw.get("comments")]
    else:  # brokerage_site
        first_name = raw.get("firstName") or raw.get("first_name")
        last_name = raw.get("lastName") or raw.get("last_name")
        email = normalize_email(raw.get("email"))
        phone = normalize_phone_e164(raw.get("phone"))
        price = parse_price(raw.get("listPrice") or raw.get("price"))
        optional_fields = [
            raw.get("propertyAddress") or raw.get("address"),
            raw.get("listingRef") or raw.get("listing_id"),
            price,
            raw.get("message") or raw.get("comments"),
        ]

    populated = sum(1 for f in optional_fields if f not in (None, ""))
    form_completeness = populated / len(optional_fields) if optional_fields else 0.0

    return CanonicalLead(
        source=source,
        price_band=price_to_band(price),
        form_completeness=form_completeness,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
    )


# ---------------------------------------------------------------------------
# Self-test / demo entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Four hardcoded sample leads representing the shapes documented in
    # SOP.md Section 12: Zillow, Realtor.com, and two brokerage-website
    # form submissions (one complete, one sparse/low-engagement).
    sample_leads_raw = [
        {
            "_source": "zillow",
            "leadSource": "Zillow Premier Agent",
            "inquiryType": "Contact Request",
            "propertyAddress": "482 Harborview Ln, Unit 3B",
            "listingId": "zpid-994211837",
            "listPrice": 615000,
            "person": {
                "firstName": "Dana",
                "lastName": "Whitfield",
                "emailAddress": "dana.whitfield@example.com",
                "phoneNumber": "(555) 214-7783",
            },
            "message": "Is this still available? Would like to see it this weekend.",
            "createdAt": "2026-06-30T14:02:11Z",
        },
        {
            "_source": "realtor_com",
            "lead_type": "buyer_inquiry",
            "source_name": "realtor.com",
            "listing": {
                "mls_id": "MLS-3387245",
                "address_line1": "482 Harborview Ln",
                "address_line2": "Unit 3B",
                "price": "615000",
            },
            "contact": {
                "full_name": "Dana Whitfield",
                "email": "Dana.Whitfield@example.com",
                "phone": "555.214.7783",
            },
            "comments": "Interested in scheduling a tour.",
            "submitted_at": "2026-06-30T14:03:47.000Z",
        },
        {
            "_source": "brokerage_site",
            "firstName": "Marcus",
            "lastName": "Reyes",
            "email": "MARCUS.REYES@EXAMPLE.COM",
            "phone": "555-908-1123",
            "propertyAddress": "17 Cedar Grove Ct",
            "listingRef": "hbv-listing-2291",
            "listPrice": "$289,900",
            "message": "Just browsing, curious about the neighborhood.",
        },
        {
            "_source": "brokerage_site",
            "firstName": "Priya",
            "lastName": None,
            "email": None,
            "phone": "5551122334",
            "propertyAddress": None,
            "listingRef": None,
            "listPrice": None,
            "message": None,
        },
    ]

    print("=" * 78)
    print("RE-01 Lead Scoring & Dedup — Self-Test")
    print("=" * 78)

    canonical_leads: list[CanonicalLead] = []
    for i, raw in enumerate(sample_leads_raw, start=1):
        lead = build_canonical_lead_from_raw(raw)
        lead.score = score_lead(lead)
        lead.tier = assign_tier(lead.score)
        canonical_leads.append(lead)

        print(f"\nLead #{i} ({raw['_source']})")
        print(f"  Name:              {lead.first_name} {lead.last_name}")
        print(f"  Normalized email:  {lead.email}")
        print(f"  Normalized phone:  {lead.phone}")
        print(f"  Price band:        {lead.price_band}")
        print(f"  Form completeness: {lead.form_completeness:.2f}")
        print(f"  Score:             {lead.score}")
        print(f"  Tier:              {lead.tier}")

    print("\n" + "=" * 78)
    print("Fuzzy dedup check — Lead #2 (Realtor.com) against store containing Lead #1 (Zillow)")
    print("=" * 78)
    # Lead #1 and Lead #2 represent the same person (Dana Whitfield) arriving
    # via two different portals with slightly different formatting —
    # this is the canonical dedup scenario from SOP Section 12/17.
    existing_store = [
        {"email": canonical_leads[0].email, "phone": canonical_leads[0].phone},
    ]
    dedup_result = find_duplicate(
        candidate_email="Dana.Whitfield@example.com",
        candidate_phone="555.214.7783",
        existing_leads=existing_store,
    )
    print(f"  Matched:          {dedup_result.matched}")
    print(f"  Matched index:    {dedup_result.matched_lead_index}")
    print(f"  Email similarity: {dedup_result.email_similarity}")
    print(f"  Phone similarity: {dedup_result.phone_similarity}")
    print(f"  Reason:           {dedup_result.reason}")

    print("\n" + "=" * 78)
    print("Fuzzy dedup check — Lead #3 (Marcus Reyes) against same store (expect no match)")
    print("=" * 78)
    dedup_result_2 = find_duplicate(
        candidate_email=canonical_leads[2].email,
        candidate_phone=canonical_leads[2].phone,
        existing_leads=existing_store,
    )
    print(f"  Matched:          {dedup_result_2.matched}")
    print(f"  Email similarity: {dedup_result_2.email_similarity}")
    print(f"  Phone similarity: {dedup_result_2.phone_similarity}")
    print(f"  Reason:           {dedup_result_2.reason}")

    print("\n" + "=" * 78)
    print("Hot-queue escalation check (24-hour engagement window, SOP Section 14)")
    print("=" * 78)
    now = datetime.now(timezone.utc)

    engaged_lead = canonical_leads[0]
    engaged_lead.last_touch_at = now - timedelta(hours=2)
    engaged_lead.engagement_event_at = now - timedelta(hours=1)
    print(f"  Lead #1 (touched 2h ago, engaged 1h ago) -> escalate: {should_escalate_to_hot(engaged_lead, now)}")

    stale_lead = canonical_leads[1]
    stale_lead.last_touch_at = now - timedelta(hours=48)
    stale_lead.engagement_event_at = now - timedelta(hours=1)
    print(f"  Lead #2 (touched 48h ago, engaged 1h ago) -> escalate: {should_escalate_to_hot(stale_lead, now)}")

    never_engaged_lead = canonical_leads[3]
    never_engaged_lead.last_touch_at = now - timedelta(hours=1)
    never_engaged_lead.engagement_event_at = None
    print(f"  Lead #4 (touched 1h ago, no engagement)   -> escalate: {should_escalate_to_hot(never_engaged_lead, now)}")

    print("\nSelf-test complete — all functions executed without error.")
