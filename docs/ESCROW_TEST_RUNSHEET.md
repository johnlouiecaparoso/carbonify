# Escrow test run sheet — replaced 2026-08-05

This document has been split into three, one per audience. It is kept only as a pointer so that any
link to it still leads somewhere useful.

Use these instead:

- [OWNER_TEST_GUIDE.md](OWNER_TEST_GUIDE.md) — yours. Set up before the session, the running order,
  every SQL statement, the admin actions, and the close-out checklist.
- [TESTER_GUIDE.md](TESTER_GUIDE.md) — hand to each helper. Plain language, no technical knowledge
  assumed. Covers the money test, the per-role tests, and the keyboard, phone and logged-out checks.
- [TESTER_FEEDBACK.md](TESTER_FEEDBACK.md) — what each helper fills in and sends back.

Why it was split. This file mixed the owner's SQL with instructions meant for people who have never
seen the system, which meant neither audience could be handed it as it was. It also duplicated the
owner's steps that now live in OWNER_TEST_GUIDE, and two copies of a procedure is exactly the drift
this project keeps having to reconcile. Nothing was lost in the split — the corrected release
procedure, the ordering, and the reason ESC-04 is the step people get wrong are all in
OWNER_TEST_GUIDE.

The technical checklist with the ESC-01 to ESC-06 identifiers is unchanged and still lives in
[UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 2.
