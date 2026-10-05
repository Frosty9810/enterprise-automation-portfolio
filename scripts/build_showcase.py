"""Generate reproducible reviewer packages from existing portfolio projects."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "showcase"
ROLES = {
    "RE-01": (
        "Buyer relationship",
        "New inquiry,Qualified,Assigned,Closed",
        "Show lead scoring and the contact preview; do not send a drip.",
    ),
    "RE-02": (
        "Transaction stakeholder",
        "Intake,Documents due,Review,Complete",
        "Show a deadline calculation; keep legal records outside CRM.",
    ),
    "RE-03": (
        "Qualified lead",
        "New,Scored,Human review,Assigned",
        "Compare two lead scores and explain the routing decision.",
    ),
    "RE-04": (
        "Deal sponsor",
        "Sourced,Analysis,Committee review,Decision",
        "Show comparable-property analysis; no investment approval.",
    ),
    "SAAS-01": (
        "Trial account owner",
        "Trial,Activated,Sales review,Converted",
        "Show usage scoring and an owner relationship handoff.",
    ),
    "SAAS-02": (
        "Billing contact",
        "Payment issue,Owner review,Resolved",
        "Show dunning state transitions without charging or messaging.",
    ),
    "SAAS-03": (
        "Customer success contact",
        "Monitoring,At risk,CS review,Resolved",
        "Show churn risk classification and a proposed CS intervention.",
    ),
    "SAAS-04": (
        "Finance account owner",
        "Reconcile,Exception,Finance review,Closed",
        "Show a billing mismatch; keep accounting amounts in the ledger.",
    ),
    "ECOM-01": (
        "Merchant stakeholder",
        "Submitted,Policy review,Approved,Closed",
        "Show an unsafe product fact change being blocked.",
    ),
    "ECOM-02": (
        "Merchant review owner",
        "Received,Triage,Safety review,Resolved",
        "Show a safety complaint preventing automatic publication.",
    ),
    "ECOM-03": (
        "Inventory operations owner",
        "Observed,Reconcile,Exception,Resolved",
        "Compare fresh and stale inventory evidence.",
    ),
    "ECOM-04": (
        "Support account owner",
        "Open,Triaged,Escalated,Resolved",
        "Show redaction and SLA routing before a relationship handoff.",
    ),
    "MKT-01": (
        "Agency client contact",
        "Monitoring,Anomaly,Budget review,Closed",
        "Show a budget recommendation awaiting human approval.",
    ),
    "REC-01": (
        "Recruiter client contact",
        "Intake,Matching,Interview review,Closed",
        "Show consent-gated matching; do not copy candidate dossiers.",
    ),
    "ACC-01": (
        "Vendor relationship owner",
        "Received,Match,Exception review,Closed",
        "Show a duplicate invoice or changed bank detail being blocked.",
    ),
    "CS-01": (
        "Support quality owner",
        "Sampled,QA review,Knowledge gap,Closed",
        "Show redacted QA and low-grounding escalation.",
    ),
    "IMP-01": (
        "Commercial counterpart",
        "Intake,Evidence review,Decision pending,Closed",
        "Explain one evidence/review boundary; no shipment or payment action.",
    ),
}


def discover() -> list[dict]:
    """Only source-backed projects get a package; blueprint folders stay roadmap."""
    dirs = sorted(path.parent for path in ROOT.glob("[0-4]*/*/SOP.md"))
    dirs += sorted(ROOT.glob("48 Enterprise Workflows/IMP-01*"))
    result = []
    for directory in dirs:
        project_id = directory.name.split()[0]
        role, stages, demo = ROLES[project_id]
        result.append(
            {
                "id": project_id,
                "title": directory.name,
                "source": directory.relative_to(ROOT).as_posix(),
                "ghlRole": role,
                "stages": stages.split(","),
                "demo": demo,
                "evidence": "local reference; live acceptance pending",
                "video": "pending recording",
            }
        )
    if {p["id"] for p in result} != set(ROLES):
        raise ValueError("Project catalog and source directories differ")
    return result


def workflow(project: dict, source: str) -> dict:
    """Embed the exact tested planner, avoiding a second JS implementation."""
    fixture = {
        "projectId": project["id"],
        "eventId": "demo-001",
        "storageConsent": True,
        "contact": {"firstName": "Demo", "lastName": "Reviewer", "email": "reviewer@example.com"},
    }
    config = {"projectId": project["id"], "locationId": "DEMO_LOCATION"}
    nodes = [
        {
            "id": "manual",
            "name": "Run synthetic demo",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [0, 0],
            "parameters": {},
        },
        {
            "id": "fixture",
            "name": "Synthetic fixture and trusted config",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [260, 0],
            "parameters": {
                "jsCode": f"return [{{json: {{event: {json.dumps(fixture)}, config: {json.dumps(config)}}}}}];"
            },
        },
        {
            "id": "plan",
            "name": "Validate and preview GHL request",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [520, 0],
            "parameters": {
                "jsCode": source.replace("export function", "function")
                + "\nreturn $input.all().map(({json}) => ({json: planContact(json.event, json.config)}));\n"
            },
        },
    ]
    return {
        "name": f"{project['id']} | GHL handoff preview | no external writes",
        "active": False,
        "settings": {"executionOrder": "v1"},
        "nodes": nodes,
        "connections": {
            nodes[i]["name"]: {
                "main": [[{"node": nodes[i + 1]["name"], "type": "main", "index": 0}]]
            }
            for i in range(2)
        },
        "pinData": {},
    }


def outputs() -> dict[Path, str]:
    projects = discover()
    source = (ROOT / "integrations/ghl-n8n/contract.mjs").read_text(encoding="utf-8")
    files = {OUT / "catalog.json": json.dumps(projects, indent=2) + "\n"}
    rows = []
    for p in projects:
        folder = OUT / p["id"]
        files[folder / "n8n-workflow.json"] = json.dumps(workflow(p, source), indent=2) + "\n"
        files[folder / "ghl-build.json"] = (
            json.dumps(
                {
                    "kind": "manual-configuration-blueprint-not-ghl-snapshot",
                    "projectId": p["id"],
                    "relationshipRole": p["ghlRole"],
                    "pipelineName": f"Portfolio / {p['id']}",
                    "stages": p["stages"],
                    "messagingEnabled": False,
                    "duplicateMatch": "email",
                    "contactFields": ["firstName", "lastName", "email", "source"],
                    "liveAcceptance": "pending",
                    "systemOfRecord": "original project system",
                },
                indent=2,
            )
            + "\n"
        )
        source_link = quote("../../" + p["source"], safe="/")
        build = ROOT / p["source"] / "build"
        scripts = sorted(build.glob("*.py"))
        command = (
            f'python "{scripts[0].relative_to(ROOT).as_posix()}"'
            if scripts
            else "See the flagship source README for its application setup."
        )
        files[folder / "README.md"] = f"""# {p["title"]}

**Evidence:** {p["evidence"]}. Synthetic scenario, no client outcome claimed.
**Video Walkthrough:** _Pending recording — see script in this SOP's project folder._
**Real Build Artifacts:** [Original source]({source_link}) · [n8n demo](n8n-workflow.json) · [GHL setup blueprint](ghl-build.json).

**Executable local integration:** [Run in the local lab](../../demo-lab/README.md) · [Actual n8n workflow](../../demo-lab/workflows/{p["id"]}.json). This wrapper executes the original demo logic and calls a local GHL simulator. Hosted GHL and the original full business workflow remain separate acceptance gates.

## What to show

{p["demo"]}

GHL role: **{p["ghlRole"]}**. Suggested pipeline: {" → ".join(p["stages"])}. This setup is a relationship layer; the original project's database retains operational authority.

## Reproduce

From the portfolio root:

```sh
{command}
node --test tests/ghl-n8n.test.mjs
```

Import this folder's n8n JSON and run the manual trigger. Inspect the valid contact request preview. Change the fixture's `storageConsent` to false and rerun: expect rejection without a request. The JSON has no HTTP node, credentials, public webhook or external effects.

Follow the [shared GHL setup and live acceptance runbook](../../integrations/ghl-n8n/README.md) to bind a test account. The blueprint is not an exported GHL snapshot. Live run IDs, recordings and screenshots remain pending.

## Four-minute walkthrough script

- 0:00–0:30 — State the business problem and the original system of record.
- 0:30–1:30 — Open the original source and demonstrate: {p["demo"]}
- 1:30–2:30 — Execute the n8n synthetic preview and inspect the field allowlist and GHL location.
- 2:30–3:15 — Run the rejected-consent and tenant-mismatch tests.
- 3:15–4:00 — Explain the tradeoff: shared deterministic handoff reduces duplicated code; production still needs durable delivery, credentials and acceptance evidence.

## Interview claim

“I can share the {p["id"]} reference implementation, its n8n contact-handoff demo, GHL setup blueprint and automated contract tests. The attached evidence uses synthetic inputs; live deployment is a separate acceptance gate.”

---
Part of the [Enterprise Automation Portfolio](../../README.md).
"""
        rows.append(
            f"| [{p['id']}]({p['id']}/README.md) | {p['title'].split(' ', 1)[1]} | {p['ghlRole']} | Local demo; live pending |"
        )
    files[OUT / "README.md"] = (
        """# Gabriel Acosta — automation engineering showcase

Start with RE-01 for lead operations, ECOM-01 for policy enforcement, ACC-01 for finance controls, and IMP-01 for governed agent architecture. Each package links its existing implementation and adds a reproducible n8n/GHL relationship handoff.

There are 17 source-backed projects. The 17 new workflows are **contact preview demos**, distinct from the 16 original business workflows. GHL blueprints are setup instructions, not deployed builds or native snapshots. All recordings and live API acceptance remain pending.

**[Open the local demo lab](../demo-lab/README.md):** real n8n execution now covers these 17 projects plus two new bounded examples. The lab's GHL endpoint is a local simulator. The original builds are cleaned client-work showcase copies, as confirmed by the owner; the current execution evidence uses synthetic fixtures.

| Package | Business project | GHL relationship | Evidence |
|---|---|---|---|
"""
        + "\n".join(rows)
        + """

## Share and evaluate

- [Engineering evidence and runbook](../37%20Testing/README.md)
- [Claude Code / Codex project examples](../20%20Claude%20Code/README.md)
- [Integration setup and failure behavior](../integrations/ghl-n8n/README.md)
- [GitHub audit and restructuring decisions](../PORTFOLIO-AUDIT-2026-09-08.md)

Generate these packages with `python scripts/build_showcase.py`; CI checks for drift with `--check`. The same tested JavaScript function is embedded into every demo.

---
Part of the [Enterprise Automation Portfolio](../README.md).
"""
    )
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = []
    for path, content in outputs().items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(path.relative_to(ROOT).as_posix())
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        print("Stale showcase artifacts:\n" + "\n".join(stale))
        return 1
    print("Showcase packages verified." if args.check else "Generated 17 showcase packages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
