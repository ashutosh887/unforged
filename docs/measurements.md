# Measurements

Every number in the post comes from this file, and every number here comes
from a real run against the live stack. Raw JSON for each run is in
`measurements/`.

Stack: `https://d1ajauwkb76on3.cloudfront.net`, us-east-1, Lambda Node 22
arm64, Aurora DSQL. The client is a MacBook in India calling through
CloudFront.

## 1. Race: 50 claims of one bank credit at the same instant

Run 1 Oct 2026, 13:21:52–13:22:03 UTC. `pnpm measure:race` (20 rounds × 50).
Raw: `measurements/race-2026-10-01T13-22-03-323Z.json`.

Each round seeds one fresh credit, then fires 50 claims at it at once from one
Lambda, first through the claim transaction with the unique index
(`claims_once`), then through a naive check-then-insert table with no index.

| Metric | Unique index | Naive control |
| --- | --- | --- |
| Rounds with exactly one winner | 20/20 | 0/20 |
| Rounds with more than one winner | 0/20 | 20/20 |
| Total approvals (1 is correct per round) | 20 | 1000 |
| Errors | 0 | 0 |
| Batch time p50 | 134 ms | 40 ms |
| Batch time p95 | 198 ms | 73 ms |

Client round trip for a whole round (both arms), p50 492 ms, p95 888 ms.

Caveats, stated in the post:
- The Lambda's pg pool holds 20 connections, so about 30 of the 50 claims wait
  for a connection. At most 20 are in flight at the database at once.
- Batch time is for all 50 claims, not per claim.
- OCC retries are reported by the handler per round (16–19 here).

## 2. Replay: the same credit claimed twice, one after the other

Run 1 Oct 2026, 13:22 UTC. `pnpm measure:replay` (10 rounds).
Raw: `measurements/replay-2026-10-01T13-22-08-240Z.json`.

| Path | Approved first claims | Approved second claims |
| --- | --- | --- |
| Unique index | 10/10 | 0/10 |
| Naive check-then-insert | 10/10 | 0/10 |

What this shows: a replay that arrives after the first claim is caught even by
a simple "was it already claimed?" check. The naive path fails only when two
claims arrive together (section 1, 1000 approvals for 20 credits). The unique
index is what makes the rule hold under both.

## 3. Incident: an unbuilt async index enforces nothing

On the first deploy, the race ran seconds after the migrate Lambda while DSQL
was still building `claims_once` (`CREATE UNIQUE INDEX ASYNC`). The guarded
path approved 50/50 claims and the index build then failed with
`found duplicate key(s) while validating index uniqueness`. Migrate now waits
on `sys.wait_for_job` for every async index and fails if any build fails. Full
log: `docs/agent-proof/sessions.md`.

## 4. DKIM DNS lookup from inside Lambda

Pending the real bank's domain and selector.

## 5. Forgery matrix and extraction accuracy

Pending the Bedrock quota increase (`docs/spikes.md`) and the real fixtures.

## 6. Real signed emails: one character changed, or a bank From swapped in

Run 1 Oct 2026, 17:58 UTC. `pnpm measure:signature` against `POST
/api/verify` on the live stack. Raw:
`measurements/signature-2026-10-01T17-58-35-649Z.json`.

The emails are not bank alerts. They are the first 80 messages with a
`DKIM-Signature` header in a public mailing-list archive with full headers
(`https://lists.gnu.org/archive/mbox/help-gnu-emacs/2026-09`), so anyone can
rerun this. Each one that verified as archived was sent twice more: once with
the first letter or digit of its body changed, once with its From header
rewritten to `alerts@hdfcbank.net`.

| Metric | Result |
| --- | --- |
| Messages with a DKIM-Signature header | 80 |
| Passing, aligned signature as archived | 37/80 (6 signing domains) |
| One body character changed → signature broken | 37/37 |
| From rewritten to hdfcbank.net → rejected | 37/37 |
| Stored as a bank credit | 0/80 |
| Request time p50 / p95 (laptop in India → CloudFront → Lambda, DNS key lookup included) | 657 ms / 1305 ms |

Caveats:
- The 43 that fail as archived were mostly modified in transit by the list
  (subject tag, footer), which is what DKIM is meant to catch. They are not
  counted as tampering results.
- These are real signatures from real senders, but not from a bank. The bank
  case is section 4 and the forgery matrix, pending the real alert.
