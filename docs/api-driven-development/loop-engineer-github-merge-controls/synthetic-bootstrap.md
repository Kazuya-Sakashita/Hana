# Synthetic bootstrap marker

This file contains status-only test data for ISSUE-170.

- data class: synthetic
- user data: none
- expected decision: `AUTO_MERGE_ELIGIBLE`
- auto-merge reservation: prohibited
- production operation: prohibited

The pull request containing this marker exists only to verify that the trusted
main controller creates and finalizes the five dedicated GitHub App checks on
one immutable head SHA.

## Rollback record

Close the pull request without merging to discard this marker. If it is merged
by mistake, revert the exact marker commit, verify that this file is absent on
`main`, and verify that the pull request has no auto-merge reservation.
