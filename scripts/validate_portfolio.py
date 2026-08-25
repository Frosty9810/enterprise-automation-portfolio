#!/usr/bin/env python3
"""Validate the repository's executable portfolio artifacts without live credentials."""

from __future__ import annotations

import ast
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IGNORED_PARTS = {".git", "__pycache__", ".venv", "venv"}


def repository_files(pattern: str) -> list[Path]:
    return [
        path
        for path in ROOT.rglob(pattern)
        if not any(part in IGNORED_PARTS for part in path.parts)
    ]


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
        if not isinstance(workflow.get("connections"), dict):
            errors.append(f"Workflow connections must be an object: {path.relative_to(ROOT)}")
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
        if not list(build.glob("*.py")):
            errors.append(f"Missing Python implementation for {sop.parent.relative_to(ROOT)}")
    return len(sops)


def validate_generated_files(errors: list[str]) -> None:
    tracked = subprocess.run(
        ["git", "ls-files"],
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
