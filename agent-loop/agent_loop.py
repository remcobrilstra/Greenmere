#!/usr/bin/env python3
"""Outer agent loop: claim, brief, validate, commit, resume.

The coding agent is external. Set AGENT_CMD to a shell command that reads
state/current_brief.md, edits the repo, and exits 0. With no AGENT_CMD the
loop prints the brief and returns control so a human or IDE agent can work.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKLIST = ROOT / "worklist.json"
STATE = ROOT / "state"
BRIEF = STATE / "current_brief.md"
FAILURE = STATE / "last_failure.log"
VERDICT = STATE / "last_verdict.txt"
PROMPT = ROOT / "prompts" / "task.md"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load() -> dict:
    return json.loads(WORKLIST.read_text())


def save(data: dict) -> None:
    WORKLIST.write_text(json.dumps(data, indent=2) + "\n")


def defaults(data: dict) -> dict:
    d = data.get("defaults") or {}
    return {
        "max_attempts": int(d.get("max_attempts", 3)),
        "stop_on_block": bool(d.get("stop_on_block", False)),
        "commit": bool(d.get("commit", True)),
        "allow_paths": d.get("allow_paths") or [],
    }


def find(data: dict, item_id: str) -> dict:
    for item in data["items"]:
        if item["id"] == item_id:
            return item
    raise SystemExit(f"unknown item {item_id}")


def next_open(data: dict) -> dict | None:
    for item in data["items"]:
        if item.get("status", "open") in ("open", "in_progress"):
            return item
    return None


def write_brief(item: dict, attempt: int, max_attempts: int) -> None:
    STATE.mkdir(exist_ok=True)
    last = FAILURE.read_text() if FAILURE.exists() else "none"
    done = "\n".join(f"- {x}" for x in item.get("done_when") or [])
    paths = "\n".join(f"- {x}" for x in item.get("allow_paths") or ["(any path in the repo)"])
    text = (
        PROMPT.read_text()
        .replace("{{id}}", item["id"])
        .replace("{{summary}}", item.get("summary", ""))
        .replace("{{done_when}}", done or "- unspecified")
        .replace("{{allow_paths}}", paths)
        .replace("{{attempt}}", str(attempt))
        .replace("{{max_attempts}}", str(max_attempts))
        .replace("{{last_failure}}", last.strip() or "none")
    )
    BRIEF.write_text(text)
    (STATE / "current_id").write_text(item["id"])


def ensure_branch(item_id: str) -> None:
    probe = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        print("not a git repo, skipping branch")
        return
    branch = f"loop/{item_id}"
    current = subprocess.check_output(
        ["git", "branch", "--show-current"], cwd=ROOT, text=True
    ).strip()
    if current == branch:
        return
    exists = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=ROOT,
    )
    cmd = ["git", "checkout", branch] if exists.returncode == 0 else ["git", "checkout", "-b", branch]
    subprocess.run(cmd, cwd=ROOT, check=True)


def claim(item_id: str | None, resume: bool = False) -> dict:
    data = load()
    cfg = defaults(data)
    item = find(data, item_id) if item_id else next_open(data)
    if item is None:
        print("queue empty")
        return data
    status = item.get("status", "open")
    if status == "done":
        raise SystemExit(f"{item['id']} is done")
    attempt = int(item.get("attempt", 0))
    if not (resume and status == "in_progress"):
        attempt += 1
    item["status"] = "in_progress"
    item["attempt"] = attempt
    item["claimed_at"] = now()
    save(data)
    write_brief(item, attempt, int(item.get("max_attempts", cfg["max_attempts"])))
    ensure_branch(item["id"])
    print(f"claimed {item['id']} attempt {attempt}")
    print(BRIEF)
    return data


def powershell() -> str:
    return os.environ.get("POWERSHELL", "powershell")


def run_cmd(cmd: str, log: Path) -> int:
    """Run cmd in PowerShell and return the native exit code."""
    STATE.mkdir(exist_ok=True)
    script = (
        "$ErrorActionPreference = 'Continue'\n"
        f"{cmd}\n"
        "if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }\n"
        "if (-not $?) { exit 1 }\n"
        "exit 0\n"
    )
    with log.open("w") as fh:
        fh.write(f"PS> {cmd}\n")
        proc = subprocess.run(
            [powershell(), "-NoProfile", "-NonInteractive", "-Command", script],
            cwd=ROOT,
            stdout=fh,
            stderr=subprocess.STDOUT,
            text=True,
        )
        fh.write(f"\nexit {proc.returncode}\n")
    return proc.returncode


def validate(item_id: str | None = None) -> int:
    data = load()
    item_id = item_id or (STATE / "current_id").read_text().strip()
    item = find(data, item_id)
    commands = item.get("validate") or ["npm run check"]
    chunks = []
    code = 0
    for cmd in commands:
        part = STATE / "validate.part.log"
        rc = run_cmd(cmd, part)
        chunks.append(part.read_text())
        if rc != 0:
            code = rc
            break
    FAILURE.write_text("".join(chunks))
    VERDICT.write_text("green" if code == 0 else "red")
    print(FAILURE.read_text())
    print("GREEN" if code == 0 else f"RED ({code})")
    return code


def dirty_paths() -> list[str]:
    out = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True)
    paths = []
    for line in out.splitlines():
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.append(path)
    return paths


def outside_allowlist(item: dict, paths: list[str]) -> list[str]:
    allow = item.get("allow_paths") or []
    if not allow:
        return []
    bad = []
    for path in paths:
        if path.startswith("state/") or path == "worklist.json":
            continue
        if not any(path == a or path.startswith(a.rstrip("/") + "/") for a in allow):
            bad.append(path)
    return bad


def commit(item_id: str | None = None) -> int:
    data = load()
    cfg = defaults(data)
    item_id = item_id or (STATE / "current_id").read_text().strip()
    item = find(data, item_id)
    if not VERDICT.exists() or VERDICT.read_text().strip() != "green":
        raise SystemExit("refusing commit: last verdict is not green")
    paths = dirty_paths()
    bad = outside_allowlist(item, paths)
    if bad:
        FAILURE.write_text("paths outside allowlist:\n" + "\n".join(bad))
        raise SystemExit("refusing commit: " + ", ".join(bad))
    subject = f"{item.get('type', 'chore')}({item.get('scope', 'loop')}): {item['summary']}"
    body = f"{item['id']}\n\nValidated by agent loop at {now()}."
    item["status"] = "done"
    item["done_at"] = now()
    save(data)
    if not cfg["commit"]:
        print(f"commit disabled, marked {item_id} done")
        return 0
    subprocess.run(["git", "add", "-A"], cwd=ROOT, check=True)
    proc = subprocess.run(["git", "commit", "-m", subject, "-m", body], cwd=ROOT)
    if proc.returncode != 0:
        data = load()
        cur = find(data, item_id)
        cur["status"] = "in_progress"
        cur.pop("done_at", None)
        save(data)
        raise SystemExit(proc.returncode)
    print(f"committed {item_id}")
    return 0


def run_agent() -> int:
    cmd = os.environ.get("AGENT_CMD", "").strip()
    if not cmd:
        print("AGENT_CMD unset. Implement the brief, then validate and commit.")
        print(BRIEF.read_text())
        return 2
    return run_cmd(cmd, STATE / "agent.log")


def run_loop(stop_on_block: bool | None, wait: bool = False, interval: float = 5.0) -> int:
    announced = False
    while True:
        data = load()
        cfg = defaults(data)
        item = next_open(data)
        if item is None:
            if not wait:
                print("queue empty")
                return 0
            if not announced:
                print(f"queue empty, waiting for new items every {interval:.0f}s")
                announced = True
            time.sleep(interval)
            continue
        announced = False
        resume = item.get("status") == "in_progress"
        claim(None if resume else item["id"], resume=resume)
        data = load()
        item = find(data, (STATE / "current_id").read_text().strip())
        max_attempts = int(item.get("max_attempts", cfg["max_attempts"]))
        if int(item.get("attempt", 1)) > max_attempts:
            item["status"] = "blocked"
            item["blocked_reason"] = "max attempts"
            save(data)
            print(f"blocked {item['id']}")
            if stop_on_block if stop_on_block is not None else cfg["stop_on_block"]:
                return 3
            continue
        rc = run_agent()
        if rc == 2:
            return 2
        if rc != 0:
            FAILURE.write_text((STATE / "agent.log").read_text())
        v = validate(item["id"])
        if v == 0:
            commit(item["id"])
            continue
        data = load()
        item = find(data, item["id"])
        if int(item.get("attempt", 1)) >= max_attempts:
            item["status"] = "blocked"
            item["blocked_reason"] = "validator red"
            save(data)
            print(f"blocked {item['id']}")
            if stop_on_block if stop_on_block is not None else cfg["stop_on_block"]:
                return 3
        else:
            print(f"retry {item['id']}")


def status() -> int:
    data = load()
    counts = {"open": 0, "in_progress": 0, "done": 0, "blocked": 0}
    for item in data["items"]:
        st = item.get("status", "open")
        counts[st] = counts.get(st, 0) + 1
        print(f"{item['id']:10} {st:12} {item.get('summary', '')}")
    print(
        f"open={counts['open']} in_progress={counts['in_progress']} "
        f"done={counts['done']} blocked={counts['blocked']}"
    )
    return 0


def check() -> int:
    data = load()
    ids = [i["id"] for i in data["items"]]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate ids")
    for item in data["items"]:
        for key in ("id", "summary"):
            if not item.get(key):
                raise SystemExit(f"item missing {key}")
    print(f"ok {len(ids)} items")
    return 0


def next_id(data: dict) -> str:
    nums = []
    for item in data["items"]:
        match = re.search(r"(\d+)$", item.get("id", ""))
        if match:
            nums.append(int(match.group(1)))
    return f"ITEM-{max(nums, default=0) + 1:03d}"


def split_list(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,]", value) if part.strip()]


def parse_heading(text: str) -> dict:
    """feat(scope): summary, or a bare summary."""
    match = re.match(r"^(?P<type>[a-zA-Z]+)(?:\((?P<scope>[^)]+)\))?:\s*(?P<summary>.+)$", text)
    if match and match.group("summary"):
        return {
            "type": match.group("type"),
            "scope": match.group("scope") or "loop",
            "summary": match.group("summary").strip(),
        }
    return {"type": "chore", "scope": "loop", "summary": text.strip()}


def make_item(data: dict, summary: str, kind: str, scope: str, paths: list[str], done: list[str], validate_cmds: list[str]) -> dict:
    cfg = defaults(data)
    item = {
        "id": next_id(data),
        "type": kind,
        "scope": scope,
        "summary": summary,
        "status": "open",
        "attempt": 0,
        "done_when": done,
        "allow_paths": paths or cfg["allow_paths"],
        "validate": validate_cmds or ["npm run check"],
    }
    return item


def add_item(summary: str, kind: str, scope: str, paths: list[str], done: list[str], validate_cmds: list[str]) -> dict:
    data = load()
    item = make_item(data, summary, kind, scope, paths, done, validate_cmds)
    data["items"].append(item)
    save(data)
    print(f"added {item['id']}  {item['type']}({item['scope']}): {item['summary']}")
    return item


def prompt_add() -> int:
    summary = input("summary: ").strip()
    if not summary:
        raise SystemExit("summary is required")
    kind = input("type [feat]: ").strip() or "feat"
    scope = input("scope [loop]: ").strip() or "loop"
    paths = split_list(input("paths (comma separated, blank = any): "))
    done: list[str] = []
    print("done when (empty line to finish):")
    while True:
        line = input("  - ").strip()
        if not line:
            break
        done.append(line)
    add_item(summary, kind, scope, paths, done, [])
    return 0


def parse_inbox(text: str) -> list[dict]:
    """Markdown inbox. A heading or a plain line starts an item.

    # feat(auth): Reject expired tokens
    done: expired token returns 401
    paths: src/auth/, src/middleware/
    validate: npm run check
    """
    specs: list[dict] = []
    cur: dict | None = None

    def flush() -> None:
        nonlocal cur
        if cur and cur.get("summary"):
            specs.append(cur)
        cur = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("<!--") or line.startswith("```"):
            continue
        if line.startswith("#"):
            title = line.lstrip("#").strip()
            if title.lower() in ("inbox", "worklist", "todo"):
                continue
            flush()
            cur = parse_heading(title)
            continue
        key, _, rest = line.partition(":")
        key = key.lower().strip()
        if cur is not None and key in ("done", "paths", "path", "validate", "type", "scope"):
            value = rest.strip()
            if key == "done":
                cur.setdefault("done_when", []).append(value)
            elif key in ("paths", "path"):
                cur.setdefault("allow_paths", []).extend(split_list(value))
            elif key == "validate":
                cur.setdefault("validate", []).append(value)
            elif key == "type":
                cur["type"] = value
            elif key == "scope":
                cur["scope"] = value
            continue
        body = line[2:].strip() if line.startswith("- ") else line
        if cur is not None and line.startswith("- ") and not re.match(
            r"^[a-zA-Z]+\([^)]+\):", body
        ):
            cur.setdefault("done_when", []).append(body)
            continue
        if line.startswith("- "):
            flush()
            cur = parse_heading(body)
            flush()
            continue
        if cur is None:
            cur = parse_heading(line)
            flush()
    flush()
    return specs


def import_inbox(path: Path) -> int:
    if not path.exists():
        raise SystemExit(f"no such file: {path}")
    specs = parse_inbox(path.read_text())
    if not specs:
        raise SystemExit(f"no items in {path}")
    data = load()
    added = []
    for spec in specs:
        item = make_item(
            data,
            spec["summary"],
            spec.get("type", "chore"),
            spec.get("scope", "loop"),
            spec.get("allow_paths") or [],
            spec.get("done_when") or [],
            spec.get("validate") or [],
        )
        data["items"].append(item)
        added.append(item)
    save(data)
    STATE.mkdir(exist_ok=True)
    archive = STATE / f"inbox-{now().replace(':', '')}.md"
    archive.write_text(path.read_text())
    path.write_text("# Inbox\n\n<!-- one heading per item, then import -->\n\n")
    for item in added:
        print(f"added {item['id']}  {item['type']}({item['scope']}): {item['summary']}")
    print(f"imported {len(added)} from {path} (copy kept at {archive})")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Validate-then-commit agent loop")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("check")
    n = sub.add_parser("next")
    n.add_argument("item_id", nargs="?")
    v = sub.add_parser("validate")
    v.add_argument("item_id", nargs="?")
    c = sub.add_parser("commit")
    c.add_argument("item_id", nargs="?")
    r = sub.add_parser("retry")
    r.add_argument("item_id")
    run = sub.add_parser("run")
    run.add_argument("--stop-on-block", action="store_true")
    run.add_argument("--wait", action="store_true", help="stay up and poll when the queue is empty")
    run.add_argument("--interval", type=float, default=5.0, help="seconds between polls when waiting")
    add = sub.add_parser("add", help="append one item without editing JSON")
    add.add_argument("summary", nargs="?", help="what done looks like, in one line")
    add.add_argument("--type", default="feat", dest="kind")
    add.add_argument("--scope", default="loop")
    add.add_argument("--path", action="append", default=[], help="repeatable allowed path")
    add.add_argument("--done", action="append", default=[], help="repeatable done-when line")
    add.add_argument("--validate", action="append", default=[], dest="validate_cmds")
    imp = sub.add_parser("import", help="pull items from a markdown inbox")
    imp.add_argument("path", nargs="?", default="inbox.md")
    args = p.parse_args()
    if args.cmd == "status":
        return status()
    if args.cmd == "check":
        return check()
    if args.cmd == "next":
        claim(args.item_id)
        return 0
    if args.cmd == "validate":
        return validate(args.item_id)
    if args.cmd == "commit":
        return commit(args.item_id)
    if args.cmd == "retry":
        data = load()
        item = find(data, args.item_id)
        item["status"] = "open"
        item.pop("blocked_reason", None)
        save(data)
        claim(args.item_id)
        return 0
    if args.cmd == "run":
        return run_loop(True if args.stop_on_block else None, wait=args.wait, interval=args.interval)
    if args.cmd == "add":
        if not args.summary:
            if sys.stdin.isatty():
                return prompt_add()
            raise SystemExit("summary required, or pipe nothing and run add with no args in a terminal")
        add_item(args.summary, args.kind, args.scope, args.path, args.done, args.validate_cmds)
        return 0
    if args.cmd == "import":
        return import_inbox(ROOT / args.path)
    return 1


if __name__ == "__main__":
    sys.exit(main())
