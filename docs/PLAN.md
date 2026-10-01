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

## Positioning (locked 1 Oct, after the ARENA run)

The idea is bigger than UPI and the post must say so in its first line:
**a signed email is proof nobody can forge, and each proof can be claimed
exactly once.** Banks, employers, marketplaces and airlines already DKIM-sign
every credit alert, payslip, refund and booking email. Unforged verifies a
claim against that signed email in code and lets each signed record be claimed
once. UPI payment screenshots are the first market and the hero demo, not the
whole product.

What the ARENA run (aws-zero-to-shipped, revision 5, full discovery on the
162-entry gallery and the official T&C) established:

- **The rubric is the T&C's, not the overview page's:** Technical Innovation &
  Originality, Implementation Quality, Community/Market Impact, Creativity &
  Storytelling, 25% each. Top 100 go to Gate 2; the AWS panel picks 5.
  "Communication quality" is the old wording. Write for the four criteria.
- **Nobody in the field does this.** Field lane: entries crowd into Bedrock
  agent harnesses and SRE automation. No entry checks DKIM, receives email,
  claims a record once, or uses DSQL.
- **The winning mechanism is ours already.** Precedent lane: past winners
  ground every decision in deterministic code before any model call. Unforged:
  Bedrock reads, code decides, UNREADABLE is a valid answer.
- **Every generated variant collapsed to this one machine** (verify DKIM, then
  claim exactly once). The other uses it found: refunds, salary slips, rent,
  expense reimbursement, booking deposits, contract acceptance. Name them in
  the post's "where it goes" section; build at most one of them (stretch 1).
- **Do not call gallery entries winners.** Misconception Map, TontinePilot
  and the rest are submitted with no result yet.

How each criterion is earned:

| Criterion | What earns it | Where it shows |
|---|---|---|
| Innovation & originality | The signed-record-claimed-once mechanism, stated as general | Title, first paragraph, architecture section |
| Implementation quality | Live race: 50 claims, exactly 1 winner vs the naive control; DKIM spoof rejected; tests | Race button, `docs/measurements.md` |
| Community/market impact | 24.5 bn UPI transactions in Aug 2026; monthly sourced screenshot thefts; personal-UPI sellers with no soundbox | Opening scene, "who it is for" |
| Creativity & storytelling | The 10-second three-card demo: green, red ₹500≠₹5,000, amber "already claimed by A12" | Cover image, first screenshot, video |

## Requirements added in this round

1. The landing page leads with the general line, then the UPI case.
2. A judge path that needs no Indian bank account: a fixture page with a real
   signed alert and screenshots (amount edit, payee edit, reuse, crop), plus the
   race button. Judges and the AI scorer must reach every verdict in under a
   minute.
3. Every number in the post comes from `docs/measurements.md`, from real runs.
4. The post's architecture section states the honest DynamoDB
   TransactWriteItems alternative and why DSQL was chosen.
5. Stretch 1 is now a second signed-record type (a refund or payslip email
   from a global sender) through the same claim path, to show it is not
   India-only.

## Blog (required, written at submission time)

The required "blog" is the Builder Center project post. Skeleton:
`planning/submission-post.md` (title, description, tags, cover, 12-section
body). Write it in the last block from real measurements and screenshots. A
Hashnode cross-post linking the Builder Center project is optional, after
submitting.

## State (1 Oct 2026, evening IST)

- Done and pushed: core (verdicts, DKIM alert check, rupee parsing, claim-once
  transaction with OCC retry, Bedrock screenshot reader, naive race control),
  Lambda handlers (`/api/shops`, `/api/alerts`, `/api/check`, `/api/race`,
  migrate), the CDK stack (CloudFront + S3 with OAC, HTTP API, five Node 22
  arm64 Lambdas, a new DSQL cluster, a 24 h upload bucket), and the web SPA.
  `pnpm synth` and `pnpm check` pass.
- Not done: nothing is deployed; the web app has not been opened in a browser;
  no measurements; no fixture page; no agent proof; no post.
- AWS: CLI 2.36.14, us-east-1, account 960149837193, signed in as **root**.
  Create `unforged-agent` before the agent deploys anything. The existing DSQL
  cluster `nft4bnb2g3fv2sg77vt7mlbcei` is Stub's: never touch it.
- Bedrock model defaults to `us.amazon.nova-2-lite-v1:0` in `cdk.json`
  (`-c modelId=...` to change) pending the hour-0 test.
- Still needed from Ashutosh: a yes on AWS spend, one bank credit-alert `.eml`
  ("Show original" in Gmail), 5 UPI screenshots.

## Next, in order

1. Create `unforged-agent` (IAM user + profile), connect the AWS MCP Server in
   Claude Code, screenshot `claude mcp list` into `docs/agent-proof/`.
2. Spikes: DKIM and UTR on the real `.eml`; Bedrock on the 5 screenshots
   (Nova 2 Lite vs Claude Haiku 4.5). Write `docs/spikes.md`.
3. `cdk bootstrap` if needed, `pnpm deploy` as `unforged-agent`, invoke the
   migrate Lambda once. Open the CloudFront URL on a phone over mobile data.
4. Fixture page and the landing copy (requirements 1–2).
5. Measurements into `docs/measurements.md`.
6. Post, cover, diagram; repo public; submit about 6 h before the deadline.

## First message for a new session here

> Read CLAUDE.md and docs/PLAN.md (the Positioning, Requirements and State sections are new). Then do "Next, in order" from step 1. I say yes to the AWS spend. Here is my bank alert .eml and 5 screenshots: …
