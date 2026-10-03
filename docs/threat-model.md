# Threat model

Each row is one way to cheat a seller or the ledger, what stops it, and where
that defence was checked. Status means:

- **Tested live**: run against the deployed stack, with numbers in
  [`measurements.md`](measurements.md).
- **Unit-tested**: covered by a test in `test/`, run by `pnpm check`.
- **Not tested**: the defence is in the code but no run has exercised it yet.

## Attacks on the payment

| Attack | What stops it | Where it was checked | Status |
|---|---|---|---|
| Buyer edits the amount on a real screenshot | The screenshot is compared with the bank's signed credit for the same UTR. A different amount returns `AMOUNT_MISMATCH` | `test/verdict.test.ts` "catches an edited amount". Live, §8 reads the edited sample as ₹5,000; the public demo has no bank alert to compare it with | Unit-tested. Live with a real alert: not tested |
| Buyer edits the payee | The UPI ID read from the screenshot must be one of the shop's own. Otherwise `PAYEE_MISMATCH` | `test/verdict.test.ts` "catches a wrong payee" | Unit-tested |
| Buyer shows a real screenshot from an earlier order | The bank credit is claimed once. The second claim hits the unique key and returns `ALREADY_CLAIMED` with the first order | §2 replay, 10/10 second claims refused, on a seeded credit with no screenshot. `test/claim.test.ts` "reports the earlier order" | Tested live on the claim path. With a real screenshot: not tested |
| Two people show the same credit at the same instant | Unique key on the claim inside one DSQL transaction, with conflicts retried | §1 race, 20/20 rounds with one winner against 1,000 approvals without the key | Tested live |
| Screenshot cropped so the UTR is gone | No UTR means `UNREADABLE`. Nothing is guessed | `test/read.test.ts`, `test/verdict.test.ts` "refuses to guess" | Unit-tested |
| Screenshot read with two candidate values | Code leaves the field empty instead of picking one | §8 describes one live misread, `okicicl` against `okicici`, left empty as designed. That run was not saved, and no unit test covers `src/core/ocr.ts` | Seen once live, not recorded |
| Buyer pays a different UPI ID and fakes "To" | Payee check, and no signed credit exists for that UTR, so `NOT_FOUND_YET` | `test/verdict.test.ts` "waits when no alert exists" | Unit-tested |

## Attacks on the bank alert

| Attack | What stops it | Where it was checked | Status |
|---|---|---|---|
| Edit one character of a signed alert | The recomputed body hash no longer equals `bh=` | §6, 37/37 real signatures broken by a one-character edit. `test/alert.test.ts` "rejects an alert edited after signing" | Tested live on real non-bank senders |
| Send an unsigned email that looks like an alert | No passing signature, so it is never stored | `test/alert.test.ts` "rejects an unsigned alert" | Unit-tested |
| Put a bank address in the From header of another email | The signature no longer verifies, because From is a signed header | §6, 37/37 rejected with From rewritten to `alerts@hdfcbank.net` | Tested live on real non-bank senders |
| Use a look-alike domain such as `hdfc-alerts.net` | The From domain must be on the bank allowlist | `test/alert.test.ts` "rejects a sender off the allowlist" | Unit-tested |
| Sign the email with your own domain and a bank From | The signing domain must be aligned with From | `test/alert.test.ts` "rejects a bank From signed by another domain" | Unit-tested |
| Strip one of two signatures to make a "new" email | The claim key uses only content every signature covers, so it does not change | §7, every stripped copy returned `ALREADY_CLAIMED`. Run by hand, no raw file | Tested live |
| Strip one of two aligned signatures from different signers, such as `bank.com` and `mail.bank.com` | The claim key starts with the From domain, not the signer domain, so both copies give one key | Fixed in `ab891c8` | Fixed. Not tested live |
| Sign only part of a bank alert with `l=` and append unsigned text that reads as a credit | A signature with `l=` never counts toward a bank credit, and such an email cannot be claimed | Fixed in `ab891c8` | Rejected in code. Not tested live |
| Add more DKIM signatures than needed to trigger many DNS lookups | Emails with more than 8 signatures are refused before any lookup | `src/core/alert.ts` | Not tested |
| Forward the alert with Gmail's normal Forward | Forwarding rewrites the message, so the signature fails and the alert is refused | None yet. Needs a real bank alert | Not tested |

## Attacks on the ledger and receipts

| Attack | What stops it | Where it was checked | Status |
|---|---|---|---|
| Claim while the unique index is still building | Claim keys are PRIMARY KEYs, which DSQL enforces from the moment the table exists. For bank credits, the migration waits for every async index build to finish and fails if one fails | §3 and §7, both times found by review, fixed and rerun | Tested live after the fix |
| Edit a field on a receipt | The KMS signature over the canonical JSON fails, and so does the hash | §9, one receipt with `what` edited failed both checks | Tested live |
| Remove or reorder a receipt in a ledger | Each receipt carries the previous one's hash. The audit recomputes every link | §9, 32-receipt chain audited with 0 breaks. A removal has not been staged | Not tested |
| Forge a receipt | Signing needs the private KMS key, which never leaves KMS | §9, a receipt with one field edited fails the offline check against the published public key. No receipt signed with another key was tried | Tested live, edited copy only |
| Two claims race for the same chain head | The chain head row is read `FOR UPDATE` in the claim transaction. One commits, the other conflicts and retries | §9, 32 receipts numbered 1 to 32 with no gaps or duplicates, 29 retries | Tested live |

## Failures of the system itself

| Failure | What happens | Status |
|---|---|---|
| DNS lookup for the key fails | The signature does not pass. The alert is refused, never stored as verified | Not tested |
| Bank rotates its DKIM key | Stored credits keep their result. An old alert pasted after the key is removed stops verifying | Not tested |
| No screenshot reader works | `/api/check` returns 503 and claims nothing. A reader failure never becomes a verdict | Seen live on 1 Oct while Bedrock's quota was 0, before Textract was added ([`agent-proof/sessions.md`](agent-proof/sessions.md)). Not in `measurements.md` |
| A deploy recreates the KMS key | Receipts name their key id, and old keys are kept, so `/api/receipts` still verifies old receipts. `/api/receipts/key` serves the current key and any retired key that signed a stored receipt | Found and fixed live, §9 |

## Known gaps

- An alert is not tied to the shop that receives it. Any shop stores any
  bank's alert. The claim-once rule still holds within each shop.
- The API Gateway address is reachable directly, around CloudFront. It has
  the same throttle and the same code, but no CloudFront security headers.
- The first 50-way runs in §7 ran under the account's old Lambda concurrency
  limit of 10, so most requests got HTTP 503 before the code ran. At the new
  limit of 1,000 the run was repeated (§7b): 10 of 10 rounds had one Verified,
  and 0 of 500 requests failed. No email was claimed twice in any run.
