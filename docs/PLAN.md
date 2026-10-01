# Unforged build plan (12 hours)

Read `CLAUDE.md` first. The long-form research lives in `planning/` (local
only, gitignored): `README.md` (the idea and sources), `architecture.md`,
`build-plan.md` (the 30-hour version), `agent-proof.md`, `submission-post.md`
(post skeleton), `field-analysis.md` (all 162 gallery entries and why this
beats them), `raw/rules.md` (official rules).

## Every part the submission needs (rules, item by item)

| # | Required by the rules | Where it comes from | Done |
|---|---|---|---|
| 1 | Live app on AWS at a public URL, reachable by judges and the AI scorer through the weeks of 5 and 12 Oct | CloudFront URL from `infra/` | ☐ |
| 2 | Documented proof the coding agent is connected to the AWS console | `docs/agent-proof/`: `claude mcp list` screenshot, transcript with MCP tool calls, CloudTrail export filtered to `unforged-agent` | ☐ |
| 3 | Published project on AWS Builder Center describing the app, the development process and how the coding agent was used | The post (this is the "blog"): title ≤255, description ≤512, Markdown body, cover 1200×675, ≤5 tags, repo link, live link | ☐ |
| 4 | One app category tag and one lane tag | `#daily-life-enhancement` + `#startups`, also stated first in the body | ☐ |
| 5 | Original, unpublished application | New repo and new code; Stub is named as the lineage of the claim-once pattern only | ☐ |
| 6 | Use of AWS services documented | Architecture diagram and service table in the post and README | ☐ |
| 7 | Public GitHub repo | `github.com/ashutosh887/unforged`, made public before submitting | ☐ |
| 8 | Submit before 2 Oct 11:59 PM PDT (3 Oct 12:29 IST) | Aim to submit 6 h early | ☐ |

The Builder Center project post is the write-up the rules require, so the
blog is mandatory. A Hashnode cross-post (as done for Stub in July) is optional
reach and goes in the stretch list.

## Timeline

| Hours | Block | Done when |
|---|---|---|
| 0–1 | `aws configure agent-toolkit`, AWS MCP Server shown connected in Claude Code; IAM user/profile `unforged-agent` (not root); spikes: one real bank credit-alert `.eml` (DKIM pass + UTR?) and Bedrock vision on 5 real UPI screenshots (Nova 2 Lite vs Claude Haiku 4.5) | `docs/spikes.md` answers both |
| 1–4 | Core: DKIM verify (`mailauth` dkimVerify + bank allowlist + From alignment), alert parser, verdicts (done), DSQL schema, claim transaction with OCC retry, `/race` and `/race-naive`; tests | `pnpm check` green |
| 4–6 | CDK: S3+CloudFront (OAC), HTTP API under `/api/*`, Lambdas (Node 22 arm64), new DSQL cluster for Unforged, Bedrock permissions, upload bucket with 24 h expiry; deployed by the agent | Hello page live at the CloudFront URL |
| 6–8 | SPA: paste alert, drop screenshot, verdict card with the bank-alert row beside it, ledger, a "try it" fixture page and race button for judges | **Live URL works from a phone on mobile data** (ship gate) |
| 8–9 | Measurements: race 20 rounds × 50 against the naive control; forgery matrix (amount edit, payee edit, reused, crop); extraction accuracy | `docs/measurements.md` from real runs only |
| 9–11 | Post written from `planning/submission-post.md`, cover image, architecture diagram, three proof screenshots embedded; README | Draft saved on Builder Center |
| 11–12 | Clean-browser check from another network, repo public, tags and links checked, submit | Published |

## Stretch, only once everything above is ticked

1. SES inbound on a domain → same alert handler (also records SES's own DKIM verdict).
2. A second bank parser, if a real sample exists.
3. 90-second demo video linked in the post.
4. Hashnode cross-post linking the Builder Center project.
5. CloudWatch metric `ClaimConflictRetries` graph in the post.
6. Audit hash chain view.

## State at handoff (1 Oct 2026)

- Done: repo scaffold, `CLAUDE.md`, verdict rules and rupee parsing with tests (`src/core/`).
- Next file: `src/core/alert.ts`, DKIM verify via `mailauth/lib/dkim/verify.js` (`dkimVerify(raw, { resolver })`, so tests can sign a fixture with `dkimSign` and a fake DNS resolver, plus a spoofed fixture that must be rejected), then parse the body with `mailparser`.
- AWS: CLI 2.36.14, region us-east-1, account 960149837193. The CLI is signed in as **root**, so create `unforged-agent` before the agent touches anything. The existing DSQL cluster `nft4bnb2g3fv2sg77vt7mlbcei` (`dsql-cluster-1`) belongs to Stub. Do not reuse or modify it; create a new one.
- Bedrock (us-east-1) lists these image-input models: `amazon.nova-2-lite-v1:0`, `amazon.nova-pro-v1:0`, `anthropic.claude-haiku-4-5-20251001-v1:0` and others. Model access for Claude has not been confirmed in this account, so test at hour 0.
- No AWS MCP server is configured in Claude Code yet.
- Still needed from Ashutosh: one bank credit-alert email, raw from Gmail "Show original" (bank name at least), and 5 of his own UPI payment screenshots.

## First message for a new session here

> Read CLAUDE.md and docs/PLAN.md, then start hour 0: set up the AWS MCP Server, create the `unforged-agent` IAM user, and run the two spikes. Here is my bank alert .eml and 5 screenshots: …
