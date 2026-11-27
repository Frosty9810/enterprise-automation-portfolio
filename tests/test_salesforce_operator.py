"""Operator safety checks independent of the local Salesforce business rules."""

import copy
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "salesforce_operator",
    ROOT / "integrations" / "salesforce-revenueos" / "revenueos_operator.py",
)
operator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(operator)


class FixtureAPI:
    def __init__(self):
        self.calls = []
        self.receipt = None

    def __call__(self, kind, body):
        self.calls.append((kind, copy.deepcopy(body)))
        if kind == "start":
            return self.state()
        if kind == "state":
            return self.state()
        if kind == "evaluate" and self.receipt is None:
            self.receipt = {
                "receiptId": "receipt",
                "runId": "run",
                "recordId": "record",
                "before": {"object": "Case"},
                "patch": {"Priority": "High"},
                "status": "pending_review",
                "expectedRevision": 1,
                "sourceHash": "fixture-source",
                "reviewer": None,
                "attempts": 0,
                "localEffects": 0,
                "history": [{"kind": "evaluated"}],
                "reasons": ["critical_service_escalation"],
                "externalActions": 0,
            }
            return copy.deepcopy(self.receipt)
        if kind == "evaluate" or (kind == "execute" and self.receipt["status"] == "completed"):
            return {**copy.deepcopy(self.receipt), "replayed": True}
        if kind == "review":
            self.receipt["status"] = "reviewed"
            self.receipt["reviewer"] = body["profile"]
        elif kind == "execute":
            self.receipt["attempts"] += 1
            outcome = body["outcome"]
            self.receipt["status"] = {
                "success": "completed",
                "timeout_after": "uncertain",
                "timeout_before": "retryable",
            }[outcome]
            self.receipt["localEffects"] = int(outcome != "timeout_before")
        elif kind == "reconcile":
            self.receipt["status"] = "completed"
        else:
            raise AssertionError(kind)
        self.receipt["history"].append({"kind": kind})
        return copy.deepcopy(self.receipt)

    def state(self):
        return {
            "runId": "run",
            "orgId": "org",
            "records": [
                {
                    "id": "record",
                    "object": "Case",
                    "revision": 1,
                    "data": {"Name": "Synthetic sensitive fixture"},
                }
            ],
            "receipts": [] if self.receipt is None else [copy.deepcopy(self.receipt)],
        }


class SalesforceOperatorTests(unittest.TestCase):
    def test_normal_cli_entrypoint_loads_without_shadowing_standard_library(self):
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "integrations" / "salesforce-revenueos" / "revenueos_operator.py"),
                "--help",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--approve-demo", result.stdout)

    def test_default_plan_replays_exact_event_and_never_reviews_or_executes(self):
        api = FixtureAPI()
        result = operator.run_operator(request=api)
        self.assertEqual(result["mode"], "proposal_only")
        self.assertEqual(result["localEffects"], 0)
        self.assertEqual(
            [kind for kind, _ in api.calls],
            ["start", "evaluate", "state", "evaluate", "state"],
        )
        evaluations = [body for kind, body in api.calls if kind == "evaluate"]
        self.assertEqual(evaluations[0], evaluations[1])
        self.assertNotIn("record", str(result))
        self.assertNotIn("Synthetic sensitive fixture", str(result))

    def test_explicit_review_recovers_uncertainty_without_reexecuting_it(self):
        api = FixtureAPI()
        result = operator.run_operator(request=api, approve_demo=True, outcome="timeout_after")
        mutations = [kind for kind, _ in api.calls if kind in ("review", "execute", "reconcile")]
        self.assertEqual(mutations, ["review", "execute", "reconcile", "execute"])
        self.assertEqual(result["localEffects"], 1)
        self.assertEqual(result["attempts"], 1)

    def test_confirmed_no_write_can_retry_once(self):
        api = FixtureAPI()
        result = operator.run_operator(request=api, approve_demo=True, outcome="timeout_before")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["attempts"], 2)
        self.assertNotIn("reconcile", [kind for kind, _ in api.calls])

    def test_wrong_receipt_identity_stops_before_approval(self):
        for field, value in (
            ("runId", "foreign"),
            ("recordId", "foreign"),
            ("receiptId", "foreign"),
        ):
            with self.subTest(field=field):
                fixture = FixtureAPI()

                def api(kind, body):
                    result = fixture(kind, body)
                    return {**result, field: value} if kind == "evaluate" else result

                with self.assertRaises(operator.OperatorError):
                    operator.run_operator(request=api, approve_demo=True)
                self.assertNotIn("review", [kind for kind, _ in fixture.calls])

    def test_missing_saved_receipt_and_forged_counts_fail_closed(self):
        for missing in (True, False):
            fixture = FixtureAPI()

            def api(kind, body):
                result = fixture(kind, body)
                if missing and kind == "state":
                    result["receipts"] = []
                elif not missing and kind == "evaluate":
                    result["localEffects"] = 1
                return result

            with self.assertRaises(operator.OperatorError):
                operator.run_operator(request=api, approve_demo=True)
            self.assertNotIn("review", [kind for kind, _ in fixture.calls])

    def test_network_uncertainty_is_never_automatically_retried(self):
        fixture = FixtureAPI()

        def api(kind, body):
            result = fixture(kind, body)
            if kind == "execute":
                raise operator.OperatorError("Reply lost")
            return result

        with self.assertRaises(operator.OperatorError):
            operator.run_operator(request=api, approve_demo=True)
        self.assertEqual([kind for kind, _ in fixture.calls].count("execute"), 1)

    def test_invalid_options_and_redirects_reject(self):
        for port in (0, 65536, True, "5680", "https://example.test"):
            with self.subTest(port=port):
                with self.assertRaises(operator.OperatorError):
                    operator.LocalLab(port)
        self.assertEqual(operator.LocalLab(5680).base, "http://127.0.0.1:5680/api/salesforce/")
        with self.assertRaises(operator.OperatorError):
            operator.NoRedirects().redirect_request(
                None, None, 302, "", {}, "https://outside.invalid"
            )
        for changes in ({"object_name": "Account"}, {"approve_demo": 1}):
            with self.assertRaises(operator.OperatorError):
                operator.run_operator(request=FixtureAPI(), **changes)


if __name__ == "__main__":
    unittest.main()
