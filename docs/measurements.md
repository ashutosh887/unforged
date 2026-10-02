# Measurements

Every number in these docs comes from this file, and every number here comes
from a real run against the live stack. Raw JSON for each run is in
`measurements/`. Where a check has no raw file, its section says so.

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

Caveats:
- The Lambda's pg pool holds 20 connections, so about 30 of the 50 claims wait
  for a connection. At most 20 are in flight at the database at once.
- Batch time is for all 50 claims, not per claim.
- OCC retries are reported by the handler per round: 16 to 19 here, 377 in
  all.

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

Pending a real bank alert and real UPI screenshots. Screenshots no longer wait
on Bedrock, since Textract reads them (§8).

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
requested through Service Quotas on 2 Oct (`L-B99A9384`). It was granted the
same day: `lambda:GetAccountSettings` now reports `ConcurrentExecutions`
1,000. The runs in this section were not repeated at the new limit.
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

The claim key is `sha256(From domain, From address, Date header, relaxed
body hash)`, taken only from parts every passing signature must cover. Until
commit `ab891c8` (2 Oct) the first part was the signer domain. Two aligned
signers, such as `bank.com` and `mail.bank.com`, then gave two keys, so
stripping one signature allowed a second claim. The live checks below ran
before that change. A
claim is refused if the passing signature does not cover Date, if the email
has more than one Date header, or if the signature uses an `l=` body-length
limit.

The first version keyed claims on the first passing signature's `b=` value.
A review agent claimed an email with two valid signatures, deleted one
`DKIM-Signature` header and claimed it again: VERIFIED twice. Keying on the
set of signatures fails too: claim the copy with only signature B, then the
copy with only signature A, and the sets are disjoint. The content key is the
same whichever signatures remain. Live check after the fix (`claimtest`, run
by hand against `POST /api/records/claim`; no raw file was kept):

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

Run 2 Oct 2026, 08:50 UTC. `API_URL=https://d1ajauwkb76on3.cloudfront.net pnpm exec tsx scripts/read-samples.ts`
(10 rounds per image) against `POST /api/read`. Raw:
`measurements/read-samples-2026-10-02T08-50-20-145Z.json`. An earlier run on
the first version of the images is kept at
`measurements/read-samples-2026-10-02T08-41-51-620Z.json`.

The two images are synthetic. I rendered them from one HTML page in a
generic UPI layout, with a fictitious payee `demo.seller@okicici` and UTR
`412345678901`. They differ only in the amount: ₹500 in `upi-paid.png`, ₹5,000
in `upi-edited.png`. They are the images the live page reads in its UPI
section.

| Image | UTR right | Amount right | Payee right | 3 field boxes drawn | Textract p50 / p95 | Round trip p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| upi-paid.png | 10/10 | 10/10 | 10/10 | 10/10 | 719 / 1882 ms | 1185 / 2581 ms |
| upi-edited.png | 10/10 | 10/10 | 10/10 | 10/10 | 855 / 3163 ms | 1245 / 3531 ms |

One misread on the way. After I cropped the images shorter, Textract read the
second copy of the payee on the edited image as `demo.seller@okicicl`. That
gave the parser two different UPI IDs, so it left the payee empty instead of
picking one, which is the rule in `src/core/ocr.ts`. I set the detail text one
pixel larger and the misread stopped. The misread run was not saved, so
neither raw file shows it: both have 10/10 payees right. On a real screenshot
the same misread leaves the payee empty, and the payee check is skipped
rather than guessed.

What this does not show: accuracy on real phone screenshots, which are
compressed, cropped and vary by app. Clean rendered text is the easy case.
Real screenshots are still pending (section 5). "Textract" is the Lambda's
`DetectDocumentText` call; the round trip adds the laptop in India to
CloudFront to Lambda.

## 9. Receipts countersigned by AWS KMS, chained per ledger

Run 2 Oct 2026, 08:43–08:52 UTC against the live stack. Every VERIFIED claim
writes a receipt. The receipt is canonical JSON (keys sorted), hashed as
`sha256(prev_hash || json)`, and signed with `ECDSA_SHA_256` by an asymmetric
KMS key (`ECC_NIST_P256`, `SIGN_VERIFY`) inside the same DSQL transaction as
the claim. Each ledger keeps one chain head row. The transaction reads it with
`SELECT ... FOR UPDATE` and updates it, so two claims that race for the same
head conflict and one retries.

**32 claims into one ledger, 8 at a time.** `EML_DIR=<dir of archive emails>
LIMIT=32 CONCURRENCY=8 pnpm measure:receipt-race`. Raw:
`measurements/receipt-race-2026-10-02T08-44-13-364Z.json`.

| Metric | Result |
| --- | --- |
| Distinct signed emails sent | 32 |
| VERIFIED, each with a receipt | 32/32 |
| Receipt sequence numbers | 1 to 32, no gaps, no duplicates |
| OCC retries across all claims | 29 |
| Request time p50 / p95 | 821 / 2658 ms |

**Offline audit of that chain.** `LEDGER=chain-1790930647118 pnpm measure:chain`
fetches every receipt and the public key named on it, recomputes each hash,
checks each link to the previous hash and verifies each signature with
`node:crypto`. Raw: `measurements/audit-chain-2026-10-02T08-52-04-616Z.json`:
32 receipts, 0 breaks. A two-receipt ledger audited the same way:
`measurements/audit-chain-2026-10-02T08-52-06-326Z.json`, 0 breaks.

**One receipt, checked by a third party.** `RECEIPT_ID=3z3ZzorcscO9xp87AaEWvU
pnpm measure:receipt`. Raw:
`measurements/verify-receipt-2026-10-02T08-52-07-272Z.json`. Signature valid,
hash valid. The same receipt with its `what` field edited fails both checks.

What went wrong first, kept in the raw files:
- The first two audits (`audit-chain-…08-44-22…`, `…08-44-24…`) reported every
  receipt broken. The chain endpoint had added a `check` field to each receipt,
  which changed the canonical JSON. It now returns checks in a separate list.
- The next audits (`…08-47-50…`, `…08-47-52…`) and one receipt check
  (`verify-receipt-…08-48-38…`) failed the signature only. Two deploys from a
  checkout without the receipt code removed the key from the stack. The key is
  retained, never deleted, so the next deploy made a new one. Receipts signed by
  the first key no longer matched the current public key. Verification now uses
  the key id written into each receipt.
  Four receipt keys exist in the account (`kms:ListKeys`, 2 Oct, created
  08:42, 08:46, 08:50 and 08:55 UTC). The current one is in the stack; the
  three retired ones stay so `/api/receipts` keeps verifying their receipts.

`/api/receipts/key` serves the current key and any retired key that signed a
stored receipt, so the offline commands above still fetch the key for every
receipt in this section.

## 10. The one-character edit on the sample email

Computed 2 Oct 2026 on the committed sample, `web/public/samples/sample.eml`,
with the page's own edit code (`firstEditable` and `editAt` in
`web/src/proof.ts`) and Node's `crypto`. No raw file, since the result is the
same on every run.

| Value | Result |
| --- | --- |
| Character changed | First letter of the body, `T` to `U` |
| Relaxed body hash before | `HMD2CH1liPuHESwWF3f+Of3R45wyySY1sMApDb2L+U0=`, equal to `bh=` |
| Relaxed body hash after | `oSQ63toFe4jIcUNrfagTVsaVeYdXs8/CM1En5gExmgs=` |
| Base64 characters that differ | 43 of 44 |

