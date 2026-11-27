"""Operate the synthetic RevenueOS lab over numeric loopback HTTP."""

import argparse
import json
import sys
import uuid
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import (
    HTTPRedirectHandler,
    ProxyHandler,
    Request,
    build_opener,
)

OBJECTS = ("Lead", "Opportunity", "Case")
OUTCOMES = ("success", "timeout_before", "timeout_after")


class OperatorError(RuntimeError):
    """A local response failed the operator contract."""


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise OperatorError("The local lab must not redirect requests.")


class LocalLab:
    def __init__(self, port=5680):
        if type(port) is not int or not 1 <= port <= 65535:
            raise OperatorError("The loopback port must be an integer from 1 to 65535.")
        self.base = f"http://127.0.0.1:{port}/api/salesforce/"
        self.opener = build_opener(ProxyHandler({}), NoRedirects())

    def __call__(self, operation, body):
        if operation not in ("start", "state", "evaluate", "review", "execute", "reconcile"):
            raise OperatorError("Unsupported local operation.")
        url = self.base + operation
        headers = {
            "Content-Type": "application/json",
            "X-Demo-Client": "local-showcase",
        }
        data = json.dumps(body).encode("utf-8")
        if operation == "state":
            from urllib.parse import urlencode

            url += "?" + urlencode({"run": body["runId"]})
            data = None
        try:
            with self.opener.open(Request(url, data=data, headers=headers), timeout=10) as response:
                raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise OperatorError("The local response exceeded its size limit.")
            result = json.loads(raw)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, HTTPException) as error:
            raise OperatorError(
                "The local request failed. Inspect saved evidence before retrying."
            ) from error
        if not isinstance(result, dict):
            raise OperatorError("Expected a local JSON object.")
        return result


def require(condition, message):
    if not condition:
        raise OperatorError(message)


def validate_state(state, object_name, run_id=None):
    require(isinstance(state, dict), "Malformed local run.")
    require(
        isinstance(state.get("runId"), str)
        and state["runId"]
        and (run_id is None or state["runId"] == run_id),
        "The local run does not match the selected run.",
    )
    records = state.get("records")
    require(isinstance(records, list), "Missing authoritative records.")
    matches = [
        item for item in records if isinstance(item, dict) and item.get("object") == object_name
    ]
    require(len(matches) == 1, "Expected one selected authoritative record.")
    record = matches[0]
    require(
        isinstance(record.get("id"), str)
        and record["id"]
        and type(record.get("revision")) is int
        and record["revision"] >= 1
        and isinstance(record.get("data"), dict),
        "Malformed authoritative record.",
    )
    return record


def verify_receipt(api, result, run_id, record_id, object_name, expected_id=None):
    require(isinstance(result, dict), "Missing receipt response.")
    require(
        isinstance(result.get("receiptId"), str)
        and result["receiptId"]
        and (expected_id is None or result["receiptId"] == expected_id)
        and result.get("runId") == run_id
        and result.get("recordId") == record_id
        and isinstance(result.get("before"), dict)
        and result["before"].get("object") == object_name,
        "The receipt identity does not match the selected record.",
    )
    state = api("state", {"runId": run_id})
    validate_state(state, object_name, run_id)
    receipts = state.get("receipts")
    require(isinstance(receipts, list), "The saved receipts are missing.")
    saved = [
        row
        for row in receipts
        if isinstance(row, dict) and row.get("receiptId") == result["receiptId"]
    ]
    require(len(saved) == 1, "The saved receipt is missing or duplicated.")
    fields = (
        "runId",
        "recordId",
        "status",
        "before",
        "patch",
        "expectedRevision",
        "sourceHash",
        "reviewer",
        "attempts",
        "localEffects",
        "history",
        "reasons",
        "externalActions",
    )
    require(
        all(field in result and result[field] == saved[0].get(field) for field in fields),
        "The returned receipt differs from its saved evidence.",
    )
    require(
        result["externalActions"] == 0
        and type(result["localEffects"]) is int
        and result["localEffects"] in (0, 1)
        and type(result["attempts"]) is int
        and 0 <= result["attempts"] <= 2
        and isinstance(result["history"], list),
        "Invalid local receipt measurements.",
    )
    return result


def run_operator(
    object_name="Case", approve_demo=False, outcome="success", port=5680, request=None
):
    """Start one fresh synthetic run and optionally perform explicit fixture approval."""
    require(object_name in OBJECTS, "Unknown Salesforce object.")
    require(type(approve_demo) is bool, "Approval must be explicit.")
    require(outcome in OUTCOMES, "Unknown local outcome.")
    api = request if request is not None else LocalLab(port)
    state = api("start", {"scenario": "normal"})
    record = validate_state(state, object_name)
    run_id = state["runId"]
    require(isinstance(state.get("orgId"), str) and state["orgId"], "Missing org fixture.")
    event = {
        "orgId": state["orgId"],
        "entityName": object_name,
        "recordId": record["id"],
        "transactionKey": str(uuid.uuid4()),
        "sequenceNumber": 1,
        "replayId": "python-local-fixture",
        "expectedRevision": record["revision"],
        "changeType": "UPDATE",
    }
    body = {"runId": run_id, "event": event}
    receipt = verify_receipt(api, api("evaluate", body), run_id, record["id"], object_name)
    receipt_id = receipt["receiptId"]

    def checked(operation, payload):
        return verify_receipt(
            api, api(operation, payload), run_id, record["id"], object_name, receipt_id
        )

    require(
        receipt["status"] == "pending_review"
        and receipt["localEffects"] == 0
        and receipt["attempts"] == 0,
        "The initial proposal must wait for review without an effect.",
    )
    replay = checked("evaluate", body)
    require(
        replay.get("replayed") is True
        and replay["history"] == receipt["history"]
        and replay["localEffects"] == 0,
        "Proposal replay changed the saved outcome.",
    )
    checks = ["proposal_waits_for_review", "event_replay_reuses_receipt"]
    if approve_demo:
        lookup = {"receiptId": receipt_id}
        receipt = checked("review", {**lookup, "profile": "revops-reviewer"})
        require(
            receipt["status"] == "reviewed"
            and receipt["reviewer"] == "revops-reviewer"
            and receipt["localEffects"] == 0,
            "Fixture approval must precede a local effect.",
        )
        checks.append("explicit_fixture_review_without_effect")
        receipt = checked("execute", {**lookup, "outcome": outcome})
        if outcome == "timeout_after":
            require(
                receipt["status"] == "uncertain" and receipt["localEffects"] == 1,
                "The lost acknowledgement must preserve one uncertain effect.",
            )
            receipt = checked("reconcile", lookup)
            checks.append("uncertain_write_reconciled")
        elif outcome == "timeout_before":
            require(
                receipt["status"] == "retryable" and receipt["localEffects"] == 0,
                "Retry requires a confirmed failure before the write.",
            )
            receipt = checked("execute", {**lookup, "outcome": "success"})
            checks.append("confirmed_no_write_retried_once")
        require(
            receipt["status"] == "completed" and receipt["localEffects"] == 1,
            "Expected one completed local effect.",
        )
        replay = checked("execute", {**lookup, "outcome": "success"})
        require(
            replay.get("replayed") is True
            and replay["history"] == receipt["history"]
            and replay["attempts"] == receipt["attempts"]
            and replay["localEffects"] == 1,
            "Completed replay changed the saved outcome.",
        )
        checks.append("completed_replay_keeps_one_effect")
        receipt = replay
    return {
        "fixture": "synthetic local Salesforce",
        "object": object_name,
        "mode": "approved_demo" if approve_demo else "proposal_only",
        "status": receipt["status"],
        "attempts": receipt["attempts"],
        "localEffects": receipt["localEffects"],
        "checks": checks,
        "externalActions": 0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--object", dest="object_name", choices=OBJECTS, default="Case")
    parser.add_argument("--port", type=int, default=5680)
    parser.add_argument("--approve-demo", action="store_true")
    parser.add_argument("--outcome", choices=OUTCOMES, default="success")
    args = parser.parse_args()
    try:
        result = run_operator(**vars(args))
    except OperatorError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
