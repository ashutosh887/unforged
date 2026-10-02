# Unforged

A signed email is proof nobody can forge, and each proof can be claimed
exactly once. Unforged's first case: is that UPI payment real? It checks a
payment screenshot against the one record a buyer cannot edit: the seller's
bank credit alert, verified by its DKIM signature. Amazon Textract (or Bedrock, once its quota
allows) reads the screenshot; code decides. Each bank credit can be claimed exactly once,
enforced by an Aurora DSQL unique index inside one transaction, so an old
real screenshot shown for a second order is caught. Positioning, rubric and
requirements: `planning/PLAN.md` (gitignored, local only).

Built for the AWS Builder Center "Zero to Shipped" hackathon. Category
`#daily-life-enhancement`, lane `#startups`. Deadline 2 Oct 2026 11:59 PM
PDT (3 Oct 12:29 IST). The ship gate is pass-or-fail: the app must be live
on AWS at a public URL, and the coding agent's connection to AWS must be
documented in `docs/agent-proof/`.

## Verdicts (code, never a prompt)

1. Screenshot unreadable or missing UTR/amount → `UNREADABLE`. Never guess.
2. No credit with this UTR for the shop → `NOT_FOUND_YET`.
3. Credit exists, amount differs → `AMOUNT_MISMATCH`.
4. Payee on the screenshot is not the shop's VPA → `PAYEE_MISMATCH`.
5. Claim insert hits the unique key → `ALREADY_CLAIMED`.
6. Otherwise → `VERIFIED`.

There is no fraud score. Every verdict is discrete and carries its reason.
UTR "YDDD" date digits are deliberately not checked (NPCI RRN revision,
2024). An alert that fails DKIM or comes from a domain off the bank
allowlist is never stored as verified.

## Stack

CloudFront + S3 (SPA, OAC) → API Gateway HTTP API → Lambda (Node 22,
arm64) → Aurora DSQL (IAM token auth, OCC, `CREATE UNIQUE INDEX ASYNC`) and
Amazon Bedrock Converse (vision, tool-use JSON schema). CDK in TypeScript
under `infra/`. One region, us-east-1. Uploads expire after 24 h.

## Do not build

Login/Cognito (capability URLs instead), a WhatsApp bot, a fraud score,
multi-region DSQL, parsers for banks with no real sample.

## Commit rules

- Author identity is whatever git identity is already configured
  (`ashutosh887`). Never change git config.
- No `Co-Authored-By` trailer. No other trailers. Ever, on this repo.
- Conventional commits, short: `type(scope): subject`, lower case,
  imperative, under about 60 characters. Types: `feat`, `fix`,
  `refactor`, `docs`, `test`, `chore`. A body only when the subject cannot
  carry the why.
- Commit in small logical chunks as work lands, not one bundle. Infra,
  backend, UI and docs are separate commits.

## Code style

- No comments in code. Names and structure carry the meaning.
- TypeScript strict. `pnpm check` (tsc + vitest) must be green before a
  commit.
- Every number in the submission post comes from a real run recorded in
  `docs/measurements.md`. Nothing is invented.
- Secrets never enter the repo. Real `.eml` files are gitignored; only
  redacted fixtures under `test/fixtures/` are committed.
