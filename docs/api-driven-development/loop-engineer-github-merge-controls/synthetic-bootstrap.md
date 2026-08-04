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
