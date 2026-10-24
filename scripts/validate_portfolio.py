#!/usr/bin/env python3
"""Validate the repository's executable portfolio artifacts without live credentials."""

from __future__ import annotations

import ast
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORED_PARTS = {
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    ".next",
    ".runtime",
    ".n8n",
}


def repository_files(pattern: str) -> list[Path]:
    # Prune dependency/build directories before traversal, not after reading them.
    files = []
    for directory, children, names in os.walk(ROOT):
        children[:] = sorted(name for name in children if name not in IGNORED_PARTS)
        files.extend(Path(directory) / name for name in sorted(names) if Path(name).match(pattern))
    return files


def validate_python(errors: list[str]) -> int:
    files = repository_files("*.py")
    for path in files:
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeDecodeError) as exc:
            errors.append(f"Python validation failed: {path.relative_to(ROOT)}: {exc}")
    return len(files)


def validate_n8n_workflows(errors: list[str]) -> int:
    files = repository_files("n8n-workflow.json")
    for path in files:
        try:
            workflow = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            errors.append(f"Invalid workflow JSON: {path.relative_to(ROOT)}: {exc}")
            continue

        if not isinstance(workflow, dict):
            errors.append(f"Workflow root must be an object: {path.relative_to(ROOT)}")
            continue
        if not isinstance(workflow.get("nodes"), list) or not workflow["nodes"]:
            errors.append(f"Workflow has no nodes: {path.relative_to(ROOT)}")
            continue
        if not isinstance(workflow.get("connections"), dict):
            errors.append(f"Workflow connections must be an object: {path.relative_to(ROOT)}")
            continue

        if any(not isinstance(node, dict) for node in workflow["nodes"]):
            errors.append(f"Workflow contains a non-object node: {path.relative_to(ROOT)}")
            continue
        names = [node.get("name") for node in workflow["nodes"]]
        if any(not isinstance(name, str) or not name for name in names):
            errors.append(f"Workflow contains an unnamed node: {path.relative_to(ROOT)}")
            continue
        if len(names) != len(set(names)):
            errors.append(f"Workflow contains duplicate node names: {path.relative_to(ROOT)}")
            continue
        ids = [node.get("id") for node in workflow["nodes"]]
        if any(not isinstance(value, str) or not value for value in ids) or len(ids) != len(
            set(ids)
        ):
            errors.append(f"Invalid or duplicate node IDs: {path.relative_to(ROOT)}")
        if workflow.get("active") is True:
            errors.append(f"Shareable workflow must be inactive: {path.relative_to(ROOT)}")
        for node in workflow["nodes"]:
            if not isinstance(node.get("parameters"), dict) or not isinstance(
                node.get("type"), str
            ):
                errors.append(
                    f"Invalid node configuration: {path.relative_to(ROOT)}: {node.get('name')}"
                )

        known = set(names)
        adjacency: dict[str, set[str]] = {name: set() for name in names}
        incoming: dict[str, int] = {name: 0 for name in names}
        for source, channels in workflow["connections"].items():
            if source not in known:
                errors.append(
                    f"Connection source does not exist in {path.relative_to(ROOT)}: {source}"
                )
                continue
            if not isinstance(channels, dict):
                errors.append(f"Invalid connection channels in {path.relative_to(ROOT)}: {source}")
                continue
            for outputs in channels.values():
                if not isinstance(outputs, list):
                    errors.append(f"Invalid outputs in {path.relative_to(ROOT)}: {source}")
                    continue
                for branch in outputs:
                    if not isinstance(branch, list):
                        errors.append(f"Invalid branch in {path.relative_to(ROOT)}: {source}")
                        continue
                    for connection in branch:
                        target = connection.get("node") if isinstance(connection, dict) else None
                        if target not in known:
                            errors.append(
                                f"Connection target does not exist in {path.relative_to(ROOT)}: {target}"
                            )
                            continue
                        if target not in adjacency[source]:
                            adjacency[source].add(target)
                            incoming[target] += 1

        roots = [
            node["name"]
            for node in workflow["nodes"]
            if isinstance(node.get("type"), str)
            and (
                node["type"].endswith("Trigger")
                or node["type"] in {"n8n-nodes-base.webhook", "n8n-nodes-base.start"}
            )
        ]
        if not roots:
            errors.append(f"Workflow has no recognized trigger: {path.relative_to(ROOT)}")
        reachable: set[str] = set()
        pending = list(roots)
        while pending:
            current = pending.pop()
            if current in reachable:
                continue
            reachable.add(current)
            pending.extend(adjacency[current] - reachable)
        unreachable = known - reachable
        if unreachable:
            errors.append(
                f"Unreachable nodes in {path.relative_to(ROOT)}: {', '.join(sorted(unreachable))}"
            )
    return len(files)


def validate_sql(errors: list[str]) -> int:
    files = repository_files("schema.sql")
    for path in files:
        try:
            sql = path.read_text(encoding="utf-8").upper()
        except UnicodeDecodeError as exc:
            errors.append(f"SQL encoding failure: {path.relative_to(ROOT)}: {exc}")
            continue
        if "CREATE TABLE" not in sql:
            errors.append(f"Schema contains no CREATE TABLE statement: {path.relative_to(ROOT)}")
    return len(files)


def validate_project_completeness(errors: list[str]) -> int:
    sops = repository_files("SOP.md")
    required = ("README.md", "n8n-workflow.json", "schema.sql")
    for sop in sops:
        build = sop.parent / "build"
        if not build.is_dir():
            errors.append(f"Missing build directory for {sop.relative_to(ROOT)}")
            continue
        for name in required:
            if not (build / name).is_file():
                errors.append(f"Missing {name} for {sop.parent.relative_to(ROOT)}")
        implementations = [
            path for suffix in ("*.py", "*.js", "*.mjs", "*.ts") for path in build.glob(suffix)
        ]
        if not implementations:
            errors.append(f"Missing executable implementation for {sop.parent.relative_to(ROOT)}")
    return len(sops)


def validate_generated_files(errors: list[str]) -> None:
    tracked = subprocess.run(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "ls-files"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    generated = [
        path
        for path in tracked
        if "__pycache__" in Path(path).parts or Path(path).suffix in {".pyc", ".pyo"}
    ]
    if generated:
        errors.append("Generated Python files found: " + ", ".join(map(str, generated)))


def main() -> int:
    errors: list[str] = []
    python_count = validate_python(errors)
    workflow_count = validate_n8n_workflows(errors)
    sql_count = validate_sql(errors)
    project_count = validate_project_completeness(errors)
    validate_generated_files(errors)

    print(
        "Validated "
        f"{project_count} projects, {python_count} Python files, "
        f"{workflow_count} n8n workflows, and {sql_count} SQL schemas."
    )
    if errors:
        print("\nValidation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Portfolio validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
