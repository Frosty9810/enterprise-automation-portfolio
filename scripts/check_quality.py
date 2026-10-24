"""Run fail-reporting local quality gates and preserve reproducible evidence."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    """Each command has an independent exit code; later success cannot mask failure."""
    commands = [
        ("artifact validation", [sys.executable, "scripts/validate_portfolio.py"]),
        ("Python tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"]),
        ("lint", [sys.executable, "-m", "ruff", "check", "."]),
        ("format", [sys.executable, "-m", "ruff", "format", "--check", "."]),
        ("generated artifacts", [sys.executable, "scripts/build_showcase.py", "--check"]),
        ("n8n Code-node tests", ["node", "--test", "tests/ghl-n8n.test.mjs"]),
        (
            "interactive demo regression tests",
            [
                "node",
                "--test",
                *[
                    p.relative_to(ROOT).as_posix()
                    for p in sorted((ROOT / "demo-lab").glob("*.test.mjs"))
                ],
                "demo-lab/test.mjs",
            ],
        ),
        ("CPU benchmark", ["node", "scripts/benchmark_handoff.mjs"]),
    ]
    commands += [
        (
            f"demo: {path.parent.parent.name.split()[0]}",
            [sys.executable, path.relative_to(ROOT).as_posix()],
        )
        for path in sorted(ROOT.glob("[0-4]*/*/build/*.py"))
    ]
    # Demo scripts can optionally invoke providers if credentials exist. Supply
    # only runtime necessities so quality checks cannot make paid model calls.
    env = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"}
    }
    env.update({"PYTHONIOENCODING": "utf-8", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"})
    results = []
    for name, command in commands:
        try:
            run = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
                check=False,
            )
            result = {
                "name": name,
                "exitCode": run.returncode,
                "output": (run.stdout + run.stderr)[-4000:].replace(str(ROOT), "<portfolio>"),
            }
        except (OSError, subprocess.TimeoutExpired) as exc:
            result = {"name": name, "exitCode": -1, "output": type(exc).__name__}
        results.append(result)
        print(f"{'PASS' if result['exitCode'] == 0 else 'FAIL'} {name}", flush=True)
    report = {
        "measuredAt": datetime.now(UTC).isoformat(),
        "python": sys.version.split()[0],
        "scope": "local synthetic artifacts; no n8n server, GHL or PostgreSQL runtime",
        "checks": results,
        "passed": all(r["exitCode"] == 0 for r in results),
    }
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports/quality.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
