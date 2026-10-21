"""Adverse scheduler cases for the local dunning proposal state machine."""

import importlib.util
import sys
import unittest
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

MODULE = (
    Path(__file__).resolve().parents[1]
    / "14 SaaS/SAAS-02 Automated Dunning and Failed-Payment Recovery Engine/build/dunning_state_machine.py"
)
SPEC = importlib.util.spec_from_file_location("dunning_replay", MODULE)
dunning = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = dunning
SPEC.loader.exec_module(dunning)
START = datetime(2026, 10, 1, tzinfo=UTC)


def make_case(**changes):
    return replace(
        dunning.DunningCase(
            "case-1",
            "invoice-1",
            "customer-1",
            dunning.PlanTier.SMB,
            dunning.DeclineReason.EXPIRED_CARD,
            1000,
            2000,
            START,
        ),
        **changes,
    )


class DunningReplayTests(unittest.TestCase):
    def test_repeated_ticks_propose_each_stage_only_once(self):
        case = make_case()
        for days, state in [
            (0, "retrying"),
            (3, "day3_email_sent"),
            (7, "day7_warning_sent"),
            (14, "suspended"),
        ]:
            at = START + timedelta(days=days)
            case = dunning.advance_case(case, at)
            self.assertEqual(case.status.value, state)
            replay = dunning.advance_case(case, at + timedelta(minutes=1))
            self.assertEqual(replay.status, case.status)
            self.assertEqual(replay.audit_trail, case.audit_trail)
        self.assertEqual(len(case.audit_trail), 4)

    def test_stale_ticks_and_future_failures_cannot_send_or_regress(self):
        case = dunning.advance_case(make_case(), START + timedelta(days=7))
        earlier = dunning.advance_case(case, START + timedelta(days=3))
        self.assertEqual(earlier.status, case.status)
        self.assertEqual(earlier.audit_trail, case.audit_trail)
        future = dunning.advance_case(make_case(), START - timedelta(seconds=1))
        self.assertEqual(future.status, dunning.CaseState.FAILED)
        self.assertEqual(future.audit_trail, [])

    def test_suspended_recovered_and_paused_cases_remain_unchanged(self):
        for state in (
            dunning.CaseState.SUSPENDED,
            dunning.CaseState.RECOVERED,
            dunning.CaseState.PAUSED,
        ):
            with self.subTest(state=state):
                case = make_case(status=state)
                result = dunning.advance_case(case, START + timedelta(days=3))
                self.assertEqual(result.status, state)
                self.assertEqual(result.audit_trail, [])

    def test_enterprise_csm_proposal_is_not_repeated_or_suspended(self):
        case = make_case(plan_tier=dunning.PlanTier.ENTERPRISE, mrr_cents=200000)
        for day in (0, 1, 3, 4, 7, 8, 14, 15):
            case = dunning.advance_case(case, START + timedelta(days=day))
        events = [entry["event"] for entry in case.audit_trail]
        self.assertEqual(sum("create_close_crm_csm_task" in item for item in events), 1)
        self.assertEqual(sum("sms_escalation" in item for item in events), 1)
        self.assertEqual(case.status, dunning.CaseState.ENTERPRISE_CSM_TASK_OPEN)
        self.assertFalse(any("trigger_downgrade" in item for item in events))

    def test_existing_csm_receipt_suppresses_creation_and_late_start_creates_once(self):
        existing = make_case(plan_tier=dunning.PlanTier.ENTERPRISE, csm_task_id="task-1")
        _, action = dunning.determine_state_and_action(existing, START)
        self.assertNotIn("create_close_crm_csm_task", action)
        late = dunning.advance_case(
            make_case(plan_tier=dunning.PlanTier.ENTERPRISE), START + timedelta(days=20)
        )
        self.assertIn("create_close_crm_csm_task", late.audit_trail[-1]["event"])
        self.assertEqual(late.status, dunning.CaseState.ENTERPRISE_CSM_TASK_OPEN)
        self.assertEqual(
            dunning.advance_case(late, START + timedelta(days=21)).audit_trail, late.audit_trail
        )

    def test_advance_does_not_modify_its_input(self):
        original = make_case()
        result = dunning.advance_case(original, START + timedelta(days=7))
        self.assertEqual(original.status, dunning.CaseState.FAILED)
        self.assertEqual(original.audit_trail, [])
        self.assertIsNot(result, original)
        self.assertIsNot(result.audit_trail, original.audit_trail)

    def test_mixed_timezone_awareness_is_rejected_explicitly(self):
        with self.assertRaises(ValueError):
            dunning.advance_case(make_case(), START.replace(tzinfo=None) + timedelta(days=3))


if __name__ == "__main__":
    unittest.main()
