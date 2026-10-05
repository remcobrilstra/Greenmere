# ITEM-001 when picking up new wearable items we need to clearly see the item we picked up

You are inside an agent loop. Do this item only. Do not start the next one.

## Done when
- unspecified

## Allowed paths
- (any path in the repo)

## Attempt
1 of 3

## Last failure
validate.sh: line 10: python: command not found
PS> bash validate.sh

exit 127

## Contract
- Touch only the allowed paths unless a change outside them is required for the item to pass validation. If you must, say so in the commit body.
- Do not commit. The loop commits after validation passes.
- Do not amend, push, or edit worklist status. The loop owns status.
- Leave the tree valid. A red gate is a failed attempt, not a partial commit.
