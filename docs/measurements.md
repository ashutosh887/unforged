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

## 7. Any signed email, claimed once: 50 simultaneous claims

Run 2 Oct 2026, 08:21–08:22 UTC. `SKIP=40 pnpm measure:record-race` against
`POST /api/records/claim` on the live stack. Raw:
`measurements/record-race-2026-10-02T08-22-55-446Z.json`.

Each round takes a fresh signed email from the same public archive as §6 and
sends 50 claims for it at once, each with a different claim reference, from a
laptop in India through CloudFront. Every claim runs its own DKIM check, then
inserts into `claimed_records`, whose primary key is the claim key.

| Metric | Result |
| --- | --- |
| Rounds | 10 × 50 requests |
| VERIFIED per round | exactly 1 in 10/10 rounds |
| Total VERIFIED (1 is correct per round) | 10 |
| ALREADY_CLAIMED | 162 |
| REJECTED | 1 (round 8; the reason was not captured, the script now records it) |
| HTTP 503, throttled before reaching the code | 327 |
| OCC retries reported | 13 |
| Request time p50 / p95 | 781 ms / 1221 ms |

What this shows: no email was ever claimed twice. What it does not show: a
clean 50-way run. This account's Lambda concurrency limit is 10 (the default
for a new account, `lambda:GetAccountSettings`), so most of each burst was
throttled by Lambda before the handler ran. A quota increase to 1,000 was
requested through Service Quotas on 2 Oct (`L-B99A9384`, status PENDING).
The in-Lambda race in §1 is not affected, since it runs all 50 claims inside
one invocation.

### After the fix: one ledger per run, within the account's concurrency

Run 2 Oct 2026, 08:33–08:35 UTC, each run on a fresh `ledger` so no earlier
claim interferes (the 08:30 run reused emails the first run had already
claimed, so 7 of its 10 rounds correctly returned ALREADY_CLAIMED ×10; it was
discarded). Raw: `measurements/record-race-2026-10-02T08-34-01-650Z.json`
and `measurements/record-race-2026-10-02T08-34-30-167Z.json`.

| Run | Exactly one VERIFIED | Total VERIFIED | ALREADY_CLAIMED | HTTP 503 (Lambda throttle) | p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| 10 rounds × 10 at once | 10/10, rest ALREADY_CLAIMED | 10 | 90 | 0 | 681 / 2076 ms |
| 5 rounds × 50 at once | 5/5 had one winner | 5 | 101 | 144 | 436 / 913 ms |

At 10 concurrent requests, the account's Lambda limit, every request reached
the code and every round had exactly one winner. At 50, the claim-once rule
still held (one VERIFIED per round, never two), and the 503s are requests
Lambda refused before the handler ran.

### The claim key, and the attack that shaped it

The claim key is `sha256(signer domain, From address, Date header, relaxed
body hash)`, taken only from parts every passing signature must cover. A
claim is refused if the passing signature does not cover Date (32/32
passing signatures in the §6 sample do), if the email has more than one Date
header, or if the signature uses an `l=` body-length limit.

The first version keyed claims on the first passing signature's `b=` value.
A review agent claimed an email with two valid signatures, deleted one
`DKIM-Signature` header and claimed it again: VERIFIED twice. Keying on the
set of signatures fails too: claim the copy with only signature B, then the
copy with only signature A, and the sets are disjoint. The content key is the
same whichever signatures remain. Live check after the fix (`claimtest`):

| Claim | Result |
| --- | --- |
| Email with two signatures, as sent | VERIFIED |
| Same email, signature A removed | ALREADY_CLAIMED (prior: the original) |
| Same email, signature B removed | ALREADY_CLAIMED |
| One body character changed | REJECTED, body hash did not verify |
| Second email: signature A removed first | VERIFIED |
| Then signature B removed | ALREADY_CLAIMED (prior: the A-removed copy) |
| Then as sent | ALREADY_CLAIMED |
| Email with its only signature removed | REJECTED, no DKIM signature |

### The async index, a second time

The same review found the §3 failure again: the first schema for these claims
used `CREATE UNIQUE INDEX ASYNC`, and two claims of one email sent while the
index was building (08:16:02.214 and 08:16:02.720 UTC) were both VERIFIED. The
index build then failed on those duplicates. Fix: the claim key is now the
table's PRIMARY KEY, which DSQL enforces from the moment the table exists.
The test rows were deleted.

The same eight checks were rerun inside a fresh ledger after the ledger change
(2 Oct, 08:33 UTC) with identical results.

## 8. Amazon Textract on two sample screenshots made for this demo

Run 2 Oct 2026, 08:41 UTC. `API_URL=https://d1ajauwkb76on3.cloudfront.net pnpm exec tsx scripts/read-samples.ts`
(10 rounds per image) against `POST /api/read`. Raw:
`measurements/read-samples-2026-10-02T08-41-51-620Z.json`.

The two images are synthetic. I rendered them from one HTML page in a
generic UPI layout, with a fictitious payee `demo.seller@okicici` and UTR
`412345678901`. They differ only in the amount: ₹500 in `upi-paid.png`, ₹5,000
in `upi-edited.png`. They are the images the live page reads in its UPI
section.

| Image | UTR right | Amount right | Payee right | 3 field boxes drawn | Textract p50 / p95 | Round trip p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| upi-paid.png | 10/10 | 10/10 | 10/10 | 10/10 | 1064 / 1384 ms | 1519 / 2698 ms |
| upi-edited.png | 10/10 | 10/10 | 10/10 | 10/10 | 742 / 1212 ms | 1174 / 2358 ms |

What this does not show: accuracy on real phone screenshots, which are
compressed, cropped and vary by app. Clean rendered text is the easy case.
Real screenshots are still pending (section 5). "Textract" is the Lambda's
`DetectDocumentText` call; the round trip adds the laptop in India to
CloudFront to Lambda.
