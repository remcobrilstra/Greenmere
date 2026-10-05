# Workflow

Use this on a real repo. The loop claims one item, the agent changes only that item, validation decides the commit.

## Once per repo

Copy this folder in, or run it from the repo root.

1. Point `validate.sh` at the real gate. Lint, types, tests, in that order. A missing command must fail, not skip.
2. Set the agent, or leave it unset and implement by hand.

```bash
export AGENT_CMD='claude -p "$(cat state/current_brief.md)" --permission-mode acceptEdits'
```

3. Start from a clean `main`. The loop checks out `loop/<id>` if this directory is a git repo.

## Intake

Do not edit `worklist.json`.

One item:

```bash
python agent_loop.py add "Reject expired tokens" --type fix --scope auth --path src/auth/ --done "expired token returns 401"
```

A batch, while you are reading the code or a review:

```bash
python agent_loop.py import inbox.md
python agent_loop.py status
```

Write the done-when line as something the gate can prove. "Works better" is not a done-when.

## One item

```bash
python agent_loop.py next
# agent or you implement state/current_brief.md only
python agent_loop.py validate
python agent_loop.py commit
```

Or the whole queue:

```bash
python agent_loop.py run
```

`run` stops and hands you the brief when `AGENT_CMD` is unset. It commits only after a green verdict.

## When the gate is red

1. Read `state/last_failure.log`. Do not re-plan from scratch.
2. Fix the same item. The next `next` or `run` resumes it and passes the log in the brief.
3. After `max_attempts` (default 3) the item is `blocked`. The queue continues unless you passed `--stop-on-block`.
4. Unblock only after the cause is fixed: `python agent_loop.py retry ITEM-004`.

A red validator never creates a commit. Paths outside `allow_paths` also refuse the commit. `worklist.json` and `state/` are allowed.

## End of a session

```bash
python agent_loop.py status
```

Leave blocked items blocked. Push is not part of the loop. When a `loop/<id>` branch is green and you want it on the remote, push that branch yourself and open the review. Do not amend the loop commit to sneak in a second item.

## What you do not do

- Do not start the next item in the same edit.
- Do not commit by hand while a claim is open.
- Do not mark an item done because the agent said it was done.
- Do not widen `allow_paths` after a refusal. Shrink the change, or add a new item for the extra work.
