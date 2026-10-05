"""Package only the local lab, cleaned source demos and installation manifests."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"node_modules", ".runtime", ".n8n", "__pycache__", ".git", ".venv", ".ruff_cache"}


def main() -> None:
    files = {
        ROOT / "requirements-dev.txt",
        ROOT / "COMPLETION-ROADMAP.md",
        ROOT / "PORTFOLIO-AGENTS.md",
    }
    for sector in ["08 Construction", "09 Medical", "10 Legal", "11 Insurance"]:
        files.add(ROOT / sector / "README.md")
    for directory in ["demo-lab", "showcase", "integrations/ghl-n8n"]:
        for current, children, names in os.walk(ROOT / directory):
            children[:] = [name for name in children if name not in EXCLUDED]
            files.update(Path(current) / name for name in names)
    for project in json.loads((ROOT / "showcase/catalog.json").read_text(encoding="utf-8")):
        source = ROOT / project["source"]
        if project["id"] == "IMP-01":
            files.add(source / "site/app/lib/agent-system.ts")
        else:
            files.update(path for path in (source / "build").iterdir() if path.is_file())
        for name in ["README.md", "SOP.md"]:
            if (source / name).exists():
                files.add(source / name)
    for name in [
        "n8n-local-executions.json",
        "local-api-benchmark.json",
        "quality.json",
        "original-node-compatibility.json",
        "n8n-security-audit.json",
        "portfolio-coverage.json",
        "expansion-evaluations.json",
        "separate-regression-results.json",
        "reel-review-demo-runs.json",
        "business-expansion-executions.json",
        "ai-engineering-executions.json",
    ]:
        files.add(ROOT / "reports" / name)
    destination = ROOT / "reports/portfolio-local-demo.zip"
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        archive.writestr(".gitignore", "node_modules/\n.venv/\ndemo-lab/.runtime/\n.env\n")
        archive.writestr(
            "README.md",
            """# Portfolio local demo package

Extract this archive into an empty folder. Use Node 24 and Python 3.14.

1. Create a Python environment: `python -m venv .venv`.
2. Activate it, then `python -m pip install -r requirements-dev.txt`.
3. Install the local n8n runtime: `npm ci --prefix demo-lab`.
4. Start the lab: `node demo-lab/server.mjs`.
5. Open http://127.0.0.1:5680 and run a project.

Run `node --test demo-lab/*.test.mjs demo-lab/test.mjs` for local contract checks.
Select Life and data for 20 additional browser-local interactive prototypes.
Their invented examples and scope are documented in demo-lab/HUMAN-COLLECTION.md.
With the server running, `node demo-lab/verify.mjs` executes every catalogued demo in n8n.

See demo-lab/README.md and demo-lab/VERIFICATION.md for scope and evidence.
GHL is a local API simulator. No hosted client service is required.
This is a focused runnable package; deeper repository documentation links may
refer to the complete GitHub portfolio rather than files included here.
The first dependency installation needs the internet; demo execution is local.
""",
        )
        for path in sorted(files):
            relative = path.relative_to(ROOT)
            if EXCLUDED.intersection(relative.parts) or path.name.startswith(".env"):
                raise ValueError(f"Unexpected runtime/private file: {relative}")
            archive.write(path, relative.as_posix())
    with ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity failure")
    checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".zip.sha256").write_text(checksum + "  " + destination.name + "\n")
    print(
        f"Packaged {len(files) + 1} files, {destination.stat().st_size:,} bytes; SHA-256 {checksum}"
    )


if __name__ == "__main__":
    main()
