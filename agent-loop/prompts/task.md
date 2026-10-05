# {{id}} {{summary}}

You are inside an agent loop. Do this item only. Do not start the next one.

## Done when
{{done_when}}

## Allowed paths
{{allow_paths}}

## Attempt
{{attempt}} of {{max_attempts}}

## Last failure
{{last_failure}}

## Contract
- Touch only the allowed paths unless a change outside them is required for the item to pass validation. If you must, say so in the commit body.
- Do not commit. The loop commits after validation passes.
- Do not amend, push, or edit worklist status. The loop owns status.
- Leave the tree valid. A red gate is a failed attempt, not a partial commit.
