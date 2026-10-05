#!/usr/bin/env bash
# Gate for one worklist item. Exit 0 only when every check passes.
# Replace the body with the repo's real lint, typecheck, and test commands.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
cd "$root"

# Windows shells rarely ship a bare `python`; take the first interpreter found.
py=""
for cand in python3 python py python3.exe python.exe py.exe; do
  if command -v "$cand" >/dev/null 2>&1; then
    py="$cand"
    break
  fi
done
if [[ -z "$py" ]]; then
  echo "validate: no python interpreter on PATH (tried python3, python, py)" >&2
  exit 127
fi

echo "== validate: syntax =="
"$py" -m py_compile agent_loop.py

echo "== validate: worklist =="
"$py" agent_loop.py check

echo "== validate: unit =="
if [[ -d tests ]]; then
  "$py" -m unittest discover -s tests -v
else
  echo "no tests/ yet"
fi

echo "== validate: ok =="
