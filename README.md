# Unforged

**Is that UPI payment real?** Unforged checks a buyer's UPI payment screenshot
against the credit alert the seller's bank emailed, which the bank signs with
DKIM. Code decides the verdict, and each bank credit can pay for one order
only, enforced by a unique key in Aurora DSQL. The same check works on any
signed email: refunds, payslips, deposits.

**[Live app](https://d1ajauwkb76on3.cloudfront.net)** · **[Hackathon project](https://builder.aws.com/project/3K4xydlPqRKwDRLpYdZkq00UWR4/unforged-is-that-upi-payment-real-checked-against-the-banks-own-signed-alert)** · **[Build article](https://builder.aws.com/content/3JztvFTHp1kaXp1h1nDiCkKltr4/a-payment-screenshot-is-a-picture-here-is-how-i-made-the-banks-signed-email-the-judge)** · **[Live status](https://d1ajauwkb76on3.cloudfront.net/#/status)**

Built by [Ashutosh Jha (@ashutosh887)](https://github.com/ashutosh887) for the
AWS Builder Center Zero to Shipped hackathon, in the Daily life enhancement
category and the Startups lane. Everything runs on AWS in `us-east-1`.

## In one minute

| | |
|---|---|
| Problem | A UPI screenshot can be edited, or a real one shown again for a second order. Sellers paid to a personal UPI ID have nothing else to check at the counter |
| Idea | The seller's bank already sends a record the buyer cannot edit: the credit alert email, signed with DKIM. Check the screenshot against it, then let each credit be claimed once |
| What is new | DKIM as the source of truth for a payment, and a database unique key as the claim-once rule. A model only reads the screenshot; code returns one of six verdicts, with no fraud score |
| Evidence | 50 claims on one credit, 20 rounds: one winner every round, where a plain check-then-insert approved 1,000. 37 of 37 real signed emails rejected after a one-character edit. 10 rounds of 50 concurrent claims through CloudFront, 0 of 500 failed. 32 KMS-signed receipts with 0 chain breaks |
| AWS | CloudFront, S3, API Gateway, Lambda, Aurora DSQL, AWS KMS, Amazon Textract, Amazon Bedrock, IAM, CloudTrail, CDK |
| Built with | Claude Code connected through the AWS MCP Server as its own IAM user. CloudTrail recorded 1,198 of its calls ([agent proof](docs/agent-proof/README.md)) |
| Try it | Open the [live app](https://d1ajauwkb76on3.cloudfront.net). The proof runs by itself; no Indian bank account needed |

## The problem

A buyer pays by UPI and holds up a phone with a payment screenshot. The seller
has a few seconds to decide whether to hand over the goods. A screenshot is
only a picture: any photo editor changes the amount, and a real screenshot
from last week's order passes every check when shown again. Matching the UTR in
the bank app catches an edit, if there is time, but never catches the real
screenshot shown twice.

UPI handled 24.51 billion transactions in August 2026
([NPCI data, Business Standard](https://www.business-standard.com/finance/news/upi-transactions-august-2026-record-volume-npci-126090100506_1.html)),
and [Razorpay](https://razorpay.com/learn/fake-payment-screenshot-scam/)
describes fake payment screenshots as a scam aimed at shopkeepers. The people
most exposed have no payment soundbox and no merchant dashboard: home tutors,
resellers, small stalls.

## How it works

| Step | What happens | Detail |
|---|---|---|
| 1. Signature | `mailauth` fetches the sender's public key from DNS and checks the DKIM signature over the headers and body | [how-it-works.md, steps 1 to 3](docs/how-it-works.md) |
| 2. Alignment | The signing domain must match the From domain, and for a bank alert the From domain must be on the allowlist | [step 4](docs/how-it-works.md#step-4-why-the-signer-must-match-the-from-address) |
| 3. Claim once | Each claim is one Aurora DSQL transaction. For any signed email the claim key is a PRIMARY KEY. For a bank credit it is a unique index on the credit id. A second claim hits the key and becomes Already claimed | [step 5](docs/how-it-works.md#step-5-claim-once) |
| 4. Receipt | The claim and a KMS-signed receipt are written together. Each receipt hashes the one before it, so a ledger is a chain | [step 6](docs/how-it-works.md#step-6-the-receipt-and-the-chain) |
| 5. Screenshot | Textract reads the screenshot. Code picks the UTR, amount and payee, and leaves any field with two candidates empty | [step 7](docs/how-it-works.md#step-7-reading-the-screenshot) |
| 6. Verdict | Code returns one of six verdicts, each with its reason. There is no fraud score | [step 8](docs/how-it-works.md#step-8-the-verdict) |

## What it looks like

All five are screenshots of the live site.

**Home.** The proof runs on load. Order A12 is verified and released; the same email for A13 comes back Already claimed and Release goods stays off.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/first-screen-dark.png">
  <img alt="Home page after its live run" src="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/first-screen.png">
</picture>

**Proof.** Your browser hashes the email body and gets the signed `bh=` value. One changed letter breaks it. Fifty claims race for one row and one gets through.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/proof-dark.png">
  <img alt="Proof page" src="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/proof.png">
</picture>

**Screenshots.** Run the real check on a throwaway demo shop. The cropped sample comes back Unreadable, the others Not found yet.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/screenshots-check-dark.png">
  <img alt="Screenshots page after Run the real check" src="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/screenshots-check.png">
</picture>

**Ledger.** Every receipt is signed by AWS KMS and hashes the one before it. Your browser rechecks the chain.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/ledger-dark.png">
  <img alt="Ledger page" src="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/ledger.png">
</picture>

**Architecture.** The stack, the verdict source code and the measured numbers.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/architecture-page-dark.png">
  <img alt="Architecture page" src="https://raw.githubusercontent.com/ashutosh887/unforged/main/docs/images/architecture-page.png">
</picture>

## Try it in 30 seconds

Open the live link. The page runs the whole proof on the live AWS stack as it
loads, with no input from you:

1. A real signed email is checked. Your browser computes its body hash and it
   matches the `bh=` value the sender signed.
2. One character changes. The hash diverges and the API answers
   `body hash did not verify`.
3. Fifty claims hit one record at once. One gets through. The same fifty
   against a check-then-insert table all get through, 49 double spends.
4. The seller releases goods for order A12. The same email for order A13 comes
   back Already claimed and Release goods stays shut.
5. The buyer's receipt, signed by an AWS KMS key, opens from a link.

Where to see each verdict:

| Verdict | Where | Live on the public site |
|---|---|---|
| Verified | [Home](https://d1ajauwkb76on3.cloudfront.net/#/) or [Proof](https://d1ajauwkb76on3.cloudfront.net/#/proof), order A12 | Yes |
| Already claimed | Home or Proof, order A13 | Yes |
| Rejected (edited email) | Proof, step 2, or click any letter of the body | Yes |
| Not found yet | [Screenshots](https://d1ajauwkb76on3.cloudfront.net/#/screenshots), press Run the real check | Yes |
| Unreadable | Screenshots, the cropped sample | Yes |
| Amount mismatch | [Your shop](https://d1ajauwkb76on3.cloudfront.net/#/shop), with a real bank alert | Needs a bank alert |
| Payee mismatch | Your shop, with a real bank alert | Needs a bank alert |

Run the real check creates a throwaway demo shop and sends four sample
screenshots through the same `/api/check` a seller uses. [Check an email](https://d1ajauwkb76on3.cloudfront.net/#/check)
takes any email you received. Each receipt carries a QR code and verifies in
the browser with WebCrypto.

## Pages on the live site

| Page | What you see |
|---|---|
| [Home](https://d1ajauwkb76on3.cloudfront.net/#/) | The six-step proof running live, and every verdict with where to see it |
| [Proof](https://d1ajauwkb76on3.cloudfront.net/#/proof) | The body hash computed in your browser, one letter changed, 50 claims racing for one row |
| [Screenshots](https://d1ajauwkb76on3.cloudfront.net/#/screenshots) | Textract reads four sample screenshots, then the real check runs on a throwaway demo shop |
| [Check an email](https://d1ajauwkb76on3.cloudfront.net/#/check) | Paste any email you received and claim it once |
| [Architecture](https://d1ajauwkb76on3.cloudfront.net/#/architecture) | The stack, the verdict source code and the measured numbers |
| [Ledger](https://d1ajauwkb76on3.cloudfront.net/#/ledger) | The receipt hash chain, rechecked in your browser with WebCrypto |
| [Status](https://d1ajauwkb76on3.cloudfront.net/#/status) | Live check of the DKIM key, Aurora DSQL and the KMS receipt key |
| [Your shop](https://d1ajauwkb76on3.cloudfront.net/#/shop) | The seller app: counter, check, ledger, Hindi or English announcements |

## Measured on the live stack

Every number here comes from a real run, recorded in
[`docs/measurements.md`](docs/measurements.md) with the command that
reproduces it.

| What | Set | Result | Baseline | Command |
|---|---|---|---|---|
| 50 claims of one bank credit at once | 20 rounds, 1 Oct | 20/20 rounds with one winner, 20 approvals | Check-then-insert: 0/20 rounds, 1,000 approvals | `pnpm measure:race`, §1 |
| One credit claimed twice in a row | 10 rounds | 0/10 second claims approved | The naive table also refuses 10/10; it fails only on simultaneous claims | `pnpm measure:replay`, §2 |
| One body character changed on a real signed email | 37 emails that pass as archived, of 80 from a public list | 37/37 rejected | An untouched copy passes | `pnpm measure:signature`, §6 |
| From rewritten to `alerts@hdfcbank.net` | The same 37 | 37/37 rejected, 0/80 stored as a bank credit | An untouched copy is refused only for being off the bank allowlist | `pnpm measure:signature`, §6 |
| 50 simultaneous claims of one signed email, through CloudFront | 10 rounds, 500 requests | 10/10 rounds with exactly one Verified and 49 Already claimed, 0 of 500 errors | p50 651 ms, p95 2,458 ms | `pnpm measure:record-race`, §7b |
| A signature stripped to make a second claim | 2 emails with two signatures | Every stripped copy came back Already claimed | The first key design approved the stripped copy | §7, no raw file |
| KMS receipts written 8 at a time | 32 claims into one ledger | Receipts 1 to 32 with no gaps, 0 breaks on offline audit | | `pnpm measure:receipt-race`, `pnpm measure:chain`, §9 |
| Textract reads of the demo screenshots | 2 synthetic images, 10 reads each | 10/10 on UTR, amount and payee, Textract p50 719 ms | Says nothing about real phone screenshots | `scripts/read-samples.ts`, §8 |

Not measured yet: anything on a real bank alert or a real UPI screenshot.
Sections 4 and 5 of `measurements.md` stay open until a real sample exists.

## Architecture

All in `us-east-1`, defined in one CDK stack, [`infra/app.ts`](infra/app.ts).

![Architecture](docs/architecture.svg)

| Service | What it does here |
|---|---|
| Amazon CloudFront | Serves the app from S3 and forwards `/api/*` to the HTTP API. HTTPS only, no caching on the API path, security headers on every response |
| Amazon S3 | One private bucket holds the built app, reached through Origin Access Control. One holds checked screenshots and deletes them after 24 hours |
| Amazon API Gateway HTTP API | Routes `/api/*` to Lambda, throttled to 25 requests a second with a burst of 50. `race` is held to 5 a second and `demo/shop` to 2 |
| AWS Lambda | Node.js 22 on arm64: `Shops`, `Alerts`, `Verify`, `Records`, `Check`, `Read`, `Receipts`, `Books`, `Status` and `Race` behind the API. `Migrate` sets up the schema and is invoked directly |
| Amazon Aurora DSQL | Shops, credits, claims, receipts and chain heads. IAM token auth from Lambda, no VPC, no stored password, deletion protection on |
| Amazon Textract | `DetectDocumentText` reads every screenshot today, in `Check` and `Read` |
| Amazon Bedrock | Converse with a tool-use schema, tried first by `Check`. This account's quota is 0 tokens a day, so reads fall through to Textract. `Read` uses Textract only |
| AWS KMS | An asymmetric P-256 key signs every receipt, from `Records`, `Alerts` and `Check`. `Receipts` fetches public keys. The private key never leaves KMS |
| AWS IAM | Grants per function, and the agent's own IAM user, `unforged-agent` |

### Why Aurora DSQL

DynamoDB gives the same claim-once result with `TransactWriteItems` and an
`attribute_not_exists` condition. I chose DSQL because the app reads its data
relationally, and the guarantee becomes a plain unique key in one SQL
transaction that any Postgres reader can audit. The price is optimistic
concurrency. A transaction that loses at commit gets `40001`, `OC000` or
`OC001`, and the claim path retries it up to 8 times. A retry that meets the
unique key, `23505`, becomes Already claimed. The AWS docs on
[DSQL concurrency control](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-concurrency-control.html)
and
[async indexes](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-create-index-async.html)
cover both behaviours.

## Security

| Attack | What stops it | Tested |
|---|---|---|
| Amount edited on a real screenshot | Compared with the bank's signed amount for that UTR | Unit test |
| Real screenshot shown for a second order | The credit's claim key is already taken | Live, 10/10 refused |
| Two claims at the same instant | Unique key inside one transaction | Live, 20/20 rounds with one winner |
| One character changed in a signed email | Body hash no longer matches `bh=` | Live, 37/37 |
| A bank address pasted into From | From is a signed header | Live, 37/37 |
| One of two signatures stripped | Claim key uses only content every signature covers | Live |
| Signature over part of the body (`l=`) | Refused before any claim | Code check |
| Debit alert passed off as a credit | Parser returns no credit | Code check |
| A receipt edited | KMS signature and hash both fail | Live |

Inputs are type-checked and size-capped, each shop's data needs its own
capability token, the API is rate-limited, and the bucket of uploaded
screenshots empties after 24 hours. All 26 attacks and failure cases, with status, are in
[docs/threat-model.md](docs/threat-model.md).

## How the coding agent built it

Claude Code built and deployed Unforged, connected to AWS through the AWS MCP
Server as the IAM user `unforged-agent`, so CloudTrail attributes every call.
CloudTrail recorded 1,198 events for that user between 1 Oct 18:40 and 2 Oct
13:35 IST. Twice, a live run showed that an async unique index enforced
nothing while it was building. The first fix made the migration wait for every
index build. The second made the claim key a PRIMARY KEY, which DSQL enforces
from the moment the table exists. The session log, the MCP connection and the
CloudTrail export are in [`docs/agent-proof/`](docs/agent-proof/README.md).

## Who it is for, and where it goes

First users are sellers paid to a personal UPI ID, through a shop link that
needs no login. The seller app reads each verdict aloud in Hindi or English,
like a payment soundbox. The mechanism is general: verify a signed email, then
let its record be claimed once. Refunds, payslips, reimbursements and booking
deposits arrive as signed email today. Next is SES inbound, so sellers forward
alerts instead of pasting them.

## Verdicts

| Verdict | When |
|---|---|
| `UNREADABLE` | The screenshot shows no readable UTR or amount. Nothing is guessed |
| `NOT_FOUND_YET` | No signed credit with this UTR has reached the shop. Alerts can lag, so check again |
| `AMOUNT_MISMATCH` | The credit exists but the amount differs. Both amounts are shown |
| `PAYEE_MISMATCH` | The screenshot was paid to another UPI ID |
| `ALREADY_CLAIMED` | The credit already paid for another order, which is named |
| `VERIFIED` | Everything matches and this claim won. Shows the bank, the time and the signing domain |

## Limits

- No real bank alert or real UPI screenshot has been tested yet.
- Forwarding an alert the ordinary way breaks its signature. Paste the
  original or upload the `.eml`.
- A bank that does not sign its alerts cannot be checked.
- An alert is not tied to the shop that receives it.

The full list, with what stops each attack, is in
[`docs/threat-model.md`](docs/threat-model.md).

## API

All routes are `POST` except `status`, JSON in and out, under `/api/`.

| Route | Body | Returns |
|---|---|---|
| `verify` | `{ raw }` | `{ from, signatures[], signer, bankCredit, notStoredBecause }`. Stores nothing |
| `records/claim` | `{ raw, claimRef ≤ 80, ledger? }` | `VERIFIED { ledger, signer, claimRef, claimedAt, receipt }`, `ALREADY_CLAIMED { priorClaim }`, or `422 REJECTED { reason }`, each with `retries` |
| `read` | `{ image }`, base64 PNG or JPEG up to 4 MB | `{ read, reader, boxes[], ms }`. Stores nothing |
| `receipts` | `{ id }` | `{ receipt, verified, check: { signature, hash } }` |
| `receipts/key` | `{ keyId? }` | `{ keyId, algorithm, curve, publicKeyPem }` |
| `receipts/chain` | `{ ledger, limit ≤ 50 }`, plus `x-shop-token` for a `shop-` ledger | `{ ledger, receipts[], checks[] }` |
| `race` | `{ n ≤ 50 }` or `{ mode: "replay" }` | `{ n, utr, guarded, naive }`, or for replay `{ mode, utr, guarded: { first, second }, naive: { first, second } }` |
| `shops` | `{ name ≤ 80, vpas ≤ 5 }` | `201 { shopId, token }` |
| `alerts` | `{ raw, orderRef? }` with `x-shop-token` | `{ credit, duplicate, decision? }` or `422 { error }` |
| `check` | `{ image, orderRef }` with `x-shop-token`, PNG, JPEG, GIF or WebP up to 4 MB | `{ verdict, reason, credit?, priorClaim?, read, reader, retries }`. `400` for a non-image, `503` when no reader works |
| `ledger` | `{}` with `x-shop-token` | `{ shop, credits[], attempts[] }` |
| `demo/shop` | none | `201 { shopId, token, name, vpas, demo: true, demoBanks }`. A throwaway shop for judges; its `demo.` token works on `check`, `alerts` and `ledger` |
| `status` (GET) | none | `{ ok, checkedAt, dkim: { domain, selector, keySha256, lookupMs, verifiesSample }, dsql: { reachable, ms }, receiptKeyId, readers }`, cached 60 s, `503` when degraded |

A shop has no login. It gets a private link holding a token, sent as
`x-shop-token` and stored only as a SHA-256 hash.

## Run it

Node.js 22 and pnpm. Deploying needs an AWS account with CDK bootstrapped in
`us-east-1`.

```sh
pnpm install
pnpm check                                                  # typecheck src, infra and web, then run the tests
API_URL=https://d1ajauwkb76on3.cloudfront.net pnpm web      # run the app locally against the live API
pnpm run deploy                                             # build the app and deploy the stack
```

After the first deploy, invoke the `MigrateFunction` from the stack outputs
once. It creates the tables and waits for every async index build to finish.

Real `.eml` files are gitignored. The one committed email,
`web/public/samples/sample.eml`, is a public post from the GNU
help-gnu-emacs archive, kept byte for byte so its signature verifies.

## Documentation

| Document | What is in it |
|---|---|
| [how-it-works.md](docs/how-it-works.md) | The sample email through every step, with real values |
| [measurements.md](docs/measurements.md) | Every number, its command and raw JSON in [measurements/](measurements/) |
| [threat-model.md](docs/threat-model.md) | 26 attacks and failure cases, what stops each, and whether it was tested live |
| [verify-yourself.md](docs/verify-yourself.md) | A command for every claim, run against the live stack |
| [faq.md](docs/faq.md) | Questions a reviewer asks |
| [agent-proof/](docs/agent-proof/README.md) | MCP connection, IAM identity, CloudTrail export, session log |

## Lineage

The claim-once pattern comes from my earlier project, Stub. The code here is
new and written for this problem.
