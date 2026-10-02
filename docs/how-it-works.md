# How Unforged works, step by step

This page follows one real email through the system. The email is the sample
the live page uses, `web/public/samples/sample.eml`: a public post by Eli
Zaretskii to the GNU help-gnu-emacs list, archived at lists.gnu.org in
September 2026 and shipped byte for byte so its signature still verifies. On
the live page it stands in for a bank's credit alert. The checks are the same.

If you know DKIM already, skip to step 4.

## The problem in one paragraph

A buyer pays a seller by UPI and shows a payment screenshot. A screenshot is a
picture. Anyone edits the amount in a photo app in a minute, and a real
screenshot from last week's order looks exactly like a new one. The seller's
bank has already sent a record the buyer cannot touch: the credit alert email.
Banks sign those emails. Unforged checks the signature, then lets each signed
record back one order.

## Step 1. What a DKIM signature is

DKIM is how a mail server signs the email it sends. The sender's server adds a
`DKIM-Signature` header. These are the fields on the sample, exactly as they
arrive:

| Field | Value on the sample | What it does |
|---|---|---|
| `v=` | `1` | DKIM version |
| `a=` | `rsa-sha256` | RSA signature over a SHA-256 hash |
| `c=` | `relaxed/relaxed` | How headers and body are normalised before hashing, so harmless whitespace changes in transit do not break it |
| `d=` | `gnu.org` | The domain that signed. For a bank alert this is the bank's domain, such as `hdfcbank.net` |
| `s=` | `fencepost-gnu-org` | The selector. It names which of the domain's keys signed |
| `h=` | `References:Subject:In-Reply-To:To:From:Date: mime-version` | The headers the signature covers |
| `bh=` | `HMD2CH1liPuHESwWF3f+Of3R45wyySY1sMApDb2L+U0=` | The SHA-256 hash of the body, in base64 |
| `b=` | 344 base64 characters starting `kVlH3/MlX/tvRgV2KJ9Q` | The signature itself, over the listed headers and the `bh=` value |

The private key that made `b=` never leaves the sender's mail server. Nobody
else produces a valid `b=` for `gnu.org`, and nobody else produces one for a
bank.

## Step 2. Fetching the key from DNS

The public half of the key sits in DNS, at a name built from `s=` and `d=`:

```
fencepost-gnu-org._domainkey.gnu.org   TXT   "v=DKIM1; k=rsa; p=MIIBIjANBg..."
```

The `Verify`, `Alerts` and `Records` Lambdas look this record up on every
check. The library is [`mailauth`](https://github.com/postalsys/mailauth),
called from `inspectSignature` in
[`src/core/alert.ts`](../src/core/alert.ts#L80). If DNS fails or the record is
missing, the signature does not pass and nothing is stored.

## Step 3. How the body hash catches an edit

The verifier recomputes the body hash itself and compares it with `bh=`:

```
body as received ──relaxed──► SHA-256 ──► HMD2CH1liPuHESwWF3f+Of3R45wyySY1sMApDb2L+U0=
                                                      │
bh= in the signature ─────────────────────────────────┘  identical, so the body is untouched
```

Change one character in the body and the hash changes completely. On the live
page, the browser computes this hash itself with `crypto.subtle`, shows it
next to `bh=`, then changes one letter and shows the new hash: 43 of its 44
characters differ. The live API then answers `body hash did not verify`.

If the attacker also rewrites `bh=` to match, the `b=` signature no longer
fits, because `b=` covers `bh=`. Making a new `b=` needs the private key.

Measured on real senders: of 80 signed emails from the public archive, 37 had a
passing signature as archived. Changing the first letter or digit of the body
broke all 37. Reproduce with `pnpm measure:signature`, section 6 of
[`measurements.md`](measurements.md).

## Step 4. Why the signer must match the From address

A signature proves only who signed. A scammer signs mail for a domain they
own, so Unforged also requires the signing domain `d=` to be aligned with the
domain in the From header. For a bank alert, the From domain must also be on
the bank allowlist in [`src/core/alert.ts`](../src/core/alert.ts#L9):
`hdfcbank.net`, `hdfcbank.com`, `icicibank.com`, `sbi.co.in`, `axisbank.com`
and `kotak.com`. A look-alike domain fails the allowlist. A real bank domain
pasted into the From header of someone else's email fails the signature.

Measured: the same 37 emails with From rewritten to `alerts@hdfcbank.net` were
rejected 37 of 37, and none of the 80 was stored as a bank credit. Section 6
again.

## Step 5. Claim once

A genuine signature proves the email is real. It does not stop the same real
email backing two orders. That is the second half of Unforged.

Every claim writes a row whose key identifies the signed record. For a bank
credit the key is the credit's id. For any signed email it is:

```
sha256( From domain, From address, Date header, relaxed body hash )
```

These are parts every passing signature must cover. Removing one of two
signatures leaves the key unchanged, so stripping a signature does not create
a new record. The code is `claimKey` in
[`src/core/alert.ts`](../src/core/alert.ts#L61). A claim is refused when the
signature does not cover Date, when the email has two Date headers, or when the
signature signs only part of the body with `l=`.

The row goes into Aurora DSQL, a serverless distributed SQL database, inside
one transaction:

```
claim A ──► BEGIN ─► INSERT (ledger, key) ─► COMMIT ─► Verified
claim B ──► BEGIN ─► INSERT (ledger, key) ─► unique key already taken (23505) ─► Already claimed
```

The key is the table's PRIMARY KEY (`ledger_claims` in
[`src/db/schema.sql`](../src/db/schema.sql#L55)). The database refuses a
second row with the same key, whatever the code does and however many claims
arrive at once.

### What optimistic concurrency means here

DSQL does not lock rows while a transaction runs. It checks for conflicts at
commit. When two transactions touch the same data, one commits and the other
gets a conflict error, SQLSTATE `40001`, `OC000` or `OC001`. Unforged retries
that transaction with jittered backoff, up to 8 attempts (`withRetry` in
[`src/core/claim.ts`](../src/core/claim.ts#L25)). The retry then meets the
unique key and becomes Already claimed. A conflict never turns into a second
approval.

### The race, measured

`POST /api/race` seeds one fresh credit and fires 50 claims at it at the same
instant from one Lambda, first through the guarded path, then through a naive
table that checks and then inserts with no unique key.

| 20 rounds × 50 claims, 1 Oct 2026 | Unique key | Check, then insert |
|---|---|---|
| Rounds with exactly one winner | 20/20 | 0/20 |
| Total approvals, where 20 is correct | 20 | 1,000 |

Reproduce with `pnpm measure:race`, section 1. The live page runs one round
of this on every visit and draws the 50 claims as dots.

## Step 6. The receipt and the chain

Every Verified claim writes a receipt in the same transaction as the claim.
The receipt holds the signer domain, what the record was claimed for, the
time, the claim key and a sequence number. Unforged does three things to it:

1. Writes it as canonical JSON with sorted keys.
2. Hashes it together with the previous receipt's hash in the same ledger:
   `hash = sha256(prev_hash || json)`. Each ledger is a chain from a genesis
   hash of 64 zeros.
3. Signs the JSON with an AWS KMS key, ECDSA on P-256. The private key never
   leaves KMS. The public key is published at `/api/receipts/key`.

```
genesis 000…0 ──► receipt 1 (hash h1) ──► receipt 2 (prev h1, hash h2) ──► receipt 3 (prev h2, hash h3)
```

What each part adds:

- The KMS signature proves Unforged issued the receipt and nobody edited it.
  A buyer or an auditor checks it offline with `openssl` or `node:crypto`.
- The chain proves no receipt was removed or reordered. Deleting receipt 2
  leaves receipt 3 pointing at a hash that no longer exists.

Measured: 32 claims into one ledger, 8 at a time, produced receipts numbered 1
to 32 with no gaps or duplicates, and an offline audit of that chain found 0
breaks. Section 9 has the commands and raw files. The code is `appendReceipt`
and `checkReceipt` in [`src/core/receipts.ts`](../src/core/receipts.ts#L40).

## Step 7. Reading the screenshot

The screenshot is the buyer's side. Unforged reads three fields from it: the
UTR, which is UPI's 12-digit transaction reference, the amount, and the UPI ID
it was paid to. Readers are tried in the order set in `cdk.json`. Amazon
Bedrock models come first. This account's Bedrock quota is 0 tokens a day, so
today Amazon Textract reads every screenshot. Textract returns lines of text
with their positions. Code then picks the fields:

- the 12-digit number next to a UTR label, or the only 12-digit number on the screen
- the one amount with a rupee sign, or the one number much taller than the rest
- the UPI ID in the lines under "To"

If any field has two possible values, code leaves it empty. An empty UTR or
amount makes the verdict `UNREADABLE`, and the seller is asked for a clearer
screenshot. A wrong guess costs the seller money. A request for a clearer
image costs a few seconds. The code is in
[`src/core/ocr.ts`](../src/core/ocr.ts#L30).

Measured on two sample screenshots made for the demo: 10 of 10 reads correct
on every field, Textract p50 719 ms. These images are clean rendered text, the
easy case. Section 8 says so and has the one misread found on the way.

## Step 8. The verdict

Code, never a prompt, picks one of six verdicts in
[`src/core/verdict.ts`](../src/core/verdict.ts#L18). Each carries its reason.

| Verdict | When | Example reason a seller sees |
|---|---|---|
| `UNREADABLE` | No readable UTR or amount | The screenshot does not show a readable UTR and amount. Ask for a clearer image; nothing was guessed. |
| `NOT_FOUND_YET` | No signed credit with this UTR | No bank alert with UTR 412345678901 has reached this shop. Do not hand over goods yet. |
| `AMOUNT_MISMATCH` | Credit found, amount differs | The screenshot says ₹5,000 but the bank credited ₹500 for this UTR. |
| `PAYEE_MISMATCH` | Paid to another UPI ID | The screenshot shows payment to someone@okaxis, which is not this shop's UPI ID. |
| `ALREADY_CLAIMED` | The claim hit the unique key | This bank credit was already used for order A12. |
| `VERIFIED` | Everything matches and the claim won | HDFC credited this amount, signed by hdfcbank.net. Claimed for order A13. |

There is no fraud score. A seller acts on a reason, and a percentage gives
them none.

## Limits

- Forwarding an email the ordinary way rewrites it and breaks the signature.
  The seller pastes the original or uploads the `.eml`.
- A bank that does not sign its alerts cannot be checked.
- A real bank alert has not been tested yet. Every bank-side number in
  `measurements.md` sections 4 and 5 is pending one.
- A blurry or cropped real screenshot comes back `UNREADABLE` by design.
- An alert is not yet tied to the shop that receives it. Any shop stores any
  bank's alert. The claim-once rule still holds per shop.
- Banks rotate DKIM keys. A credit already stored keeps its result. An old alert
  pasted after the bank removes its key stops verifying.

The full list of attacks and what stops each is in
[`threat-model.md`](threat-model.md).
