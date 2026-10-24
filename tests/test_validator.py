"""Regression cases for the validator's previously permissive graph checks."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "validator", Path(__file__).resolve().parents[1] / "scripts/validate_portfolio.py"
)
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class CompletenessTests(unittest.TestCase):
    def test_javascript_is_an_implementation_but_docs_alone_are_not(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "SOP.md").write_text("Synthetic project")
            build = root / "build"
            build.mkdir()
            for name in ("README.md", "n8n-workflow.json", "schema.sql"):
                (build / name).write_text("")
            previous = validator.ROOT
            validator.ROOT = root
            try:
                errors = []
                validator.validate_project_completeness(errors)
                self.assertTrue(any("implementation" in error for error in errors))
                (build / "demo.js").write_text("console.log('synthetic')")
                errors = []
                validator.validate_project_completeness(errors)
                self.assertEqual(errors, [])
            finally:
                validator.ROOT = previous


class WorkflowValidationTests(unittest.TestCase):
    def validate(self, nodes, connections):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "n8n-workflow.json").write_text(
                json.dumps(
                    {
                        "nodes": nodes,
                        "connections": connections,
                        "active": False,
                    }
                ),
                encoding="utf-8",
            )
            previous = validator.ROOT
            validator.ROOT = root
            try:
                errors = []
                validator.validate_n8n_workflows(errors)
                return errors
            finally:
                validator.ROOT = previous

    def node(self, name, kind="code"):
        return {"id": name, "name": name, "type": "n8n-nodes-base." + kind, "parameters": {}}

    def test_disconnected_code_is_not_a_trigger(self):
        errors = self.validate([self.node("start", "manualTrigger"), self.node("orphan")], {})
        self.assertTrue(any("Unreachable" in error for error in errors))

    def test_malformed_node_does_not_crash(self):
        self.assertTrue(self.validate([42], {}))

    def test_malformed_branch_is_rejected(self):
        errors = self.validate([self.node("start", "manualTrigger")], {"start": {"main": [42]}})
        self.assertTrue(any("Invalid branch" in error for error in errors))

    def test_valid_connected_graph_passes(self):
        nodes = [self.node("start", "manualTrigger"), self.node("work")]
        self.assertEqual(self.validate(nodes, {"start": {"main": [[{"node": "work"}]]}}), [])

    def test_duplicate_ids_are_rejected(self):
        nodes = [self.node("start", "manualTrigger"), self.node("work")]
        nodes[1]["id"] = "start"
        self.assertTrue(self.validate(nodes, {"start": {"main": [[{"node": "work"}]]}}))
