# Agent loop

Outer loop for a long backlog. Each item is planned, changed, validated, and committed on its own. Nothing lands in git unless the gate is green.

## Cycle

```
pick next open item
  -> claim it (status: in_progress, attempt += 1)
  -> agent implements only that item
  -> run validators in order
  -> green: commit, mark done, next item
  -> red:  feed the log back, retry up to max_attempts
  -> exhausted: mark blocked, continue or stop (--stop-on-block)
```

State lives in `worklist.json` and `state/`. Kill the process and rerun; claimed items are resumed, finished items are skipped.

## Layout

```
worklist.json     backlog + per-item status
validate.sh       gate: lint, types, tests (edit the commands)
agent_loop.py     orchestrator
WORKFLOW.md       the operating procedure for a real repo
prompts/task.md   brief handed to the coding agent
inbox.md          human list, imported into the worklist
state/            claims, logs, last failure
```

## Add work

Do not hand-edit `worklist.json`. One item:

```bash
python agent_loop.py add "Reject expired tokens" \
  --type fix --scope auth \
  --path src/auth/ \
  --done "expired token returns 401"
```

A batch is a markdown file. Heading is the item, extra lines are optional:

```markdown
# feat(auth): Reject expired tokens
done: expired token returns 401
paths: src/auth/, src/middleware/
```

```bash
python agent_loop.py import            # reads inbox.md, then clears it
python agent_loop.py import tasks.md   # any markdown list
```

`add` with no arguments prompts for summary, type, scope, paths, and done-when. Ids are assigned as `ITEM-004` and up.

## Wire your agent

The loop does not call a model. It prepares a task brief, checks out `loop/<id>`, then shells out to whatever you set as `AGENT_CMD`. The command must edit the repo and exit 0 when it believes the item is done. Validation, not the agent's word, decides the commit.

```bash
# example: Claude Code, Codex, Aider, or a local script
export AGENT_CMD='claude -p "$(cat state/current_brief.md)" --permission-mode acceptEdits'
python agent_loop.py run
```

Without `AGENT_CMD` the loop still works as a supervisor: it prints the brief and waits for you to implement, then validates and commits.

```bash
python agent_loop.py next          # claim next item, write brief
# ...make the change...
python agent_loop.py validate      # run the gate
python agent_loop.py commit        # commit only if last validate passed
python agent_loop.py run           # full autonomous loop
python agent_loop.py status
python agent_loop.py retry ITEM-ID
```

## Rules that keep a long run honest

- One item, one commit. Subject is `type(scope): summary` taken from the worklist.
- Commit only paths the item declares, plus files the agent actually touched. Unrelated dirty files fail the gate.
- Validators run from the repo root and must exit 0. A missing command is a failure, not a skip.
- Retries see `state/last_failure.log`. Do not start over from a blank context.
- Blocked items stay in the list. Fix the cause, then `retry`.
- No amend, no push. Push is a separate human step.
