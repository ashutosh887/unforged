# Changelog

Newest version first. Every version uses the same headings, and a heading
with nothing under it is dropped. Every number links back to a run in
[docs/measurements.md](docs/measurements.md).

To ship a version, add its section here and commit it. Tag that commit
`vX.Y.Z`, push the tag, then publish the section as the GitHub release:

```sh
awk '/^## v1.0.0/{f=1;next} /^## v/{f=0} f' CHANGELOG.md > notes.md
gh release create v1.0.0 --title "v1.0.0" --notes-file notes.md
```

## v1.0.0, 26 October 2026

The build that won AWS Builder Center
[Zero to Shipped](https://builder.aws.com/build/hackathons/e83e84e5-4f4c-383b-bbe9-4a15ac195d55/zero-to-shipped?tab=winners),
one of five winners from 3,812 participants. The code is the same one the
judges saw. After judging closed, only the docs changed and one unused file
was removed.

Unforged checks a UPI payment screenshot against the seller's bank credit
alert, which the bank signs with DKIM. Each bank credit can pay for one
order only.

### Added

- DKIM check on any pasted email or `.eml`. The signing domain must match
  the From domain, and a bank alert must come from a bank on the allowlist.
- Claim once. Each claim runs in one Aurora DSQL transaction. A second
  claim on the same credit hits a unique key and comes back
  `ALREADY_CLAIMED`, naming the order it already paid for.
- Screenshot check. Textract reads the UTR, amount and payee, and code
  returns one of six verdicts: `VERIFIED`, `ALREADY_CLAIMED`,
  `AMOUNT_MISMATCH`, `PAYEE_MISMATCH`, `NOT_FOUND_YET` or `UNREADABLE`. A
  field with two possible readings stays empty. There is no fraud score.
- Receipts signed by an AWS KMS P-256 key. Each receipt hashes the one
  before it, the browser rechecks the chain with WebCrypto, and every
  receipt has a QR code for the buyer.
- A seller app behind a private shop link, with no login. It reads each
  verdict aloud in Hindi or English.
- A public site with eight pages: Home, Proof, Screenshots, Check an email,
  Architecture, Ledger, Status and Your shop. The proof runs by itself when
  Home loads.
- `/api/status` reports the DKIM key, DSQL and the KMS key, cached for 60
  seconds.
- The API refuses `l=` partial-body signatures, debit alerts and amounts
  too large to store exactly.

### Measured

- 50 claims on one bank credit, 20 rounds. One claim won every round. A
  plain check-then-insert approved all 1,000.
- 50 claims on one signed email through CloudFront, 10 rounds. Each round
  gave one `VERIFIED` and 49 `ALREADY_CLAIMED`, and 0 of 500 requests
  failed. p50 651 ms, p95 2,458 ms.
- One character changed in each of 37 real signed emails. All 37 were
  rejected.
- 32 KMS receipts written 8 at a time. No gaps, and an offline audit found
  0 chain breaks.
- Textract read 2 synthetic screenshots 10 times each and got the UTR,
  amount and payee right every time. p50 719 ms.

### Known limits

- No real bank alert or real UPI screenshot has been tested.
- Forwarding an alert breaks its signature, so the seller has to paste the
  original or upload the `.eml`.
- The seller adds each alert by hand. SES inbound is not built yet.
- This account's Bedrock quota is 0 tokens a day, so Textract does every
  read.
- An alert is not tied to the shop that receives it.

### Stack

One CDK stack in `us-east-1`: CloudFront, S3, an API Gateway HTTP API,
Lambda on Node 22 arm64, Aurora DSQL, AWS KMS, Amazon Textract and Amazon
Bedrock. Live at <https://d1ajauwkb76on3.cloudfront.net>.

### Built with

Claude Code, connected through the AWS MCP Server as its own IAM user,
`unforged-agent`. CloudTrail recorded 1,198 of its calls. The evidence is
in [docs/agent-proof/](docs/agent-proof/README.md).

### Links

- [Hackathon project](https://builder.aws.com/project/3K4xydlPqRKwDRLpYdZkq00UWR4/unforged-is-that-upi-payment-real-checked-against-the-banks-own-signed-alert)
- [Build article](https://builder.aws.com/content/3JztvFTHp1kaXp1h1nDiCkKltr4/a-payment-screenshot-is-a-picture-here-is-how-i-made-the-banks-signed-email-the-judge)
- [Live status](https://d1ajauwkb76on3.cloudfront.net/#/status)
