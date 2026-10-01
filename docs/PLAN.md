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

## ARENA review (1 Oct, project chat, three models)

The same question went to Qwen 3 235B, GPT-OSS-120B and Sarvam 105B
through ARENA's project chat, with this run's evidence, gates, Play and
build plan as context. Raw answers: `planning/arena-review.md`. Only
points at least two models agreed on are kept here.

Agreed by all three:
1. **The demo:** paste, VERIFIED with the bank domain and time. Paste
   again, **ALREADY CLAIMED · first claimed HH:MM:SS**, and the
   **Release goods** button is disabled. Show REJECTED with its reason.
2. **Hour-0 spike:** DKIM verify plus the DNS TXT key lookup inside Lambda,
   on real alerts from SBI, HDFC or ICICI. Measure success rate and
   latency.
3. **Cut:** Step Functions, SMTP/IMAP forwarding, accounts and login,
   history, admin and analytics views, multi-bank selector config.
4. **The line to state:** no gallery entry verifies a bank DKIM signature
   and locks the claim exactly once; the verdict is a storage-layer
   guarantee, not a model's guess.

Agreed by two:
- Open the story with: **"The screenshot they showed you was never the
  source of truth."**
- Publish the replay ablation (unique index vs the naive control) with the
  measurement script committed before the numbers.
- A short narrated demo video that ends on the seller pressing Release
  goods.

Open decision (Ashutosh): all three pitched the pasted email alone, and
one said to cut the Bedrock screenshot read. Unforged as built checks the
buyer's screenshot against the seller's alert. Decide which input leads.

Never use (fabricated or wrong in the answers): "23 cases", "₹4.1M",
"NCRB 4,046", "RBI December 2026 draft guidelines", the domain
"sbibank.co.in" (SBI is sbi.co.in), multi-region read replicas,
ElastiCache, DKIM in a CloudFront Function, "DNSKEY" (DKIM keys are TXT
records), and Buyable/IncidentLense as nearest entries.

## Blog (required, written at submission time)

The required "blog" is the Builder Center project post. Skeleton:
`planning/submission-post.md` (title, description, tags, cover, 12-section
body). Write it in the last block from real measurements and screenshots. A
Hashnode cross-post linking the Builder Center project is optional, after
submitting.

## ARENA c4 card: what we take, what we don't (decided 1 Oct, 6:30 PM IST)

The c4 card (a 30-hour, email-only variant) was read against this plan. The plan wins wherever they differ.

Taken:
- **Replay ablation as the headline measurement:** the same signed alert claimed twice with the unique index on, then against the naive table (no index). Report approved first claims vs approved second claims. This sits alongside the 50-way race.
- **Spike item:** time the DKIM DNS lookup from inside Lambda for the real bank's domain, and record p50/p95 in `docs/spikes.md`.
- **Its do-not-build list, where it agrees with ours:** no auth, billing, admin or metrics dashboard, settings, run history, waitlist, second platform, IMAP/SMTP ingestion, or seller registration UI.
- **Demo rehearsal plus a recorded video backup.**

Not taken:
- **Email-only input, with no screenshots.** The screenshot is the thing a buyer forges; the alert is what proves it. The hero demo stays screenshot plus alert.
- **Python `dkim` library:** `mailauth` in Node is already built and tested against tampering.
- **Message-ID as the claim key:** the bank credit (UTR + amount) is the thing claimed once.
- **A single REJECTED verdict:** keep the six discrete verdicts.
- **Its corpus of "10 real emails from SBI, HDFC, ICICI over 6 months":** that corpus does not exist. Only samples Ashutosh actually provides count, and the post states the real count.
- **Its 30-hour timeline and the "Muvattupuzha case" reference:** neither is sourced. Nothing unsourced goes into the post.

## Arena run, second read (2 Oct, from the full `aws-zero-to-shipped` dump)

Taken:
- **The AI scorer skims** and the overview lists "communication quality":
  the post now opens with a four-line "In one minute" block and a "Judges
  start here" link to `#try`.
- **Claim-once alone is not new** (another entry uses a DynamoDB conditional
  write). The post says the new part is what gets claimed: a record whose
  origin is proven by its signature.
- **Self-authored test set was a gate kill** for a sibling candidate. The
  public-archive measurement (§6) answers it; lead Implementation with it.
- **Limits stated plainly:** forwarding breaks the signature, unsigned banks
  cannot be checked, DNS failure fails closed, key rotation.
- **Key rotation during judging:** re-check the demo alert on 5 and 12 Oct.

Never use (fabricated in the run): "RFC 6376 test vectors, Section 8.2
Examples 1–8", "Priya, Mumbai jewellery seller", "Vikram Patel", "4-second
receipt", "180 s manual check", "100 concurrent / zero duplicates", "Step
Functions with DSQL integration", any prize pool other than "$5,000 AWS
credits per winner". The UPI figure is sourced to Business Standard (NPCI
data, 24.51 bn in Aug 2026); no scam-count figure has a source.

## State (1 Oct 2026, 19:15 IST)

- **Live:** https://d1ajauwkb76on3.cloudfront.net, stack `Unforged`, DSQL
  cluster `ubud3ytzjhhzezzpiu3v5774de` (Stub's `nft4bnb2g3fv2sg77vt7mlbcei`
  untouched). Deployed by `unforged-agent` (IAM user, CLI profile, AWS MCP
  Server pinned to it). Migrate has run and now waits for async index builds.
- **Working live:** race (20/20 rounds exactly one winner vs 1000/1000 naive,
  `docs/measurements.md`), replay, DKIM rejection of an unsigned alert,
  `/api/spike/dkim`, the Try-it page and phone layout, Release goods,
  "first claimed HH:MM:SS", and claiming a signed alert directly
  (`/api/alerts` with `orderRef`, no Bedrock needed).
- **Blocked:** Bedrock. Every model's daily token quota is 0 and not
  adjustable (`docs/spikes.md`); needs an AWS Support limit increase.
  `/api/check` returns 503 and claims nothing until then.
- **Proof so far:** `docs/agent-proof/mcp-connected.txt`, `sessions.md` (the
  async-index catch), `scripts/agent-trail.sh` for the CloudTrail export.
  Cover at `docs/post/cover.png`; post draft in `planning/submission-post-draft.md`.
- **Rechecked 1 Oct 22:40 IST through aws-mcp:** stack `UPDATE_COMPLETE`,
  DSQL `ACTIVE`, Bedrock still 0 on Nova 2 Lite, Haiku 4.5 and Nova Lite.
  The Support API needs a paid plan, so the limit case is console-only.
- **Added 1 Oct night:** `POST /api/verify` and the "Check any signed email"
  card at the top of Try it. A judge pastes any email, sees the DKIM signer,
  then breaks it with one changed character; nothing is stored. Measured on
  80 public-archive emails (measurements §6): 37/37 broken by one character,
  37/37 rejected with a bank From. The card's "Use the demo bank alert"
  button appears once `web/public/fixtures/alert.eml` is published.
- **Added 2 Oct, early:** the shop ledger (`/api/ledger`, `Books` Lambda,
  `attempts_by_shop` index, migrated) and `.eml` upload/drop on every
  email field.
- **Still needed from Ashutosh:** the Bedrock quota case, the real bank
  `.eml`, 5 screenshots, and the open decision above on which input leads.

## Next, in order (next session, 2 Oct)

Already done: unforged-agent, MCP, deploy, migrate, Try-it page, landing
copy, race and replay measurements, cover, README, diagram.

**A. Inputs (first 30 min, needs Ashutosh)**
1. Bedrock limit case filed (Support → Service limit increase → Bedrock,
   us-east-1, Nova 2 Lite L-210172B5 + Claude Haiku 4.5 tokens/day).
2. Real bank `.eml` and 5 screenshots dropped into `planning/samples/`.
3. Demo lead decided: screenshot + alert, or alert only.

**B. With the `.eml` (about 1 h)**
4. DKIM + UTR spike on the real alert; fix the parser for that bank's format
   if needed. Record in `docs/spikes.md`.
5. `pnpm measure:dkim` against `/api/spike/dkim` with the bank's
   domain/selector → measurements §4.
6. Claim the real alert directly twice (VERIFIED, then ALREADY_CLAIMED) on the
   live site; screenshot both cards.
6a. `ALERT_EML=planning/samples/<file>.eml SHOP_VPAS=<vpa> API_URL=<url>
    pnpm measure:tamper`: one body digit changed and a look-alike From
    domain, both expected rejected, plus the untouched original as control.
    Fills the post's two alert rows of the forgery table.

**C. With Bedrock (about 1.5 h; skip to D if the quota is still 0)**
7. Extraction spike: Nova 2 Lite vs Claude Haiku 4.5 on the 5 screenshots;
   pick the model and set `modelId` order in `cdk.json`.
8. Make fixtures: original, amount edit, payee edit (visible UPI ID), crop
   (UTR cut). Set `shop.vpa` in `web/public/fixtures/manifest.json` to the
   real payee. Copy the `.eml` in byte for byte. Redeploy.
9. `pnpm measure:forgery` → measurements §5. Run Try it end to end on a phone
   over mobile data and time it.

**D. If Bedrock is still 0 at noon IST**
10. Lead the demo with "Claim a signed alert directly" (works without
    Bedrock); the Try-it page runs the alert-only cases; the post says
    plainly that screenshot reading is built, and shows the 503 fail-closed
    behaviour. Nothing is faked.

**E. Agent proof (30 min, through the aws-mcp tools)**
11. In the new session, use aws-mcp tools for: stack status, DSQL `sys.jobs`
    check, CloudWatch logs of Check, so the transcript holds MCP calls.
12. `scripts/agent-trail.sh` → `docs/agent-proof/cloudtrail-unforged-agent.json`;
    screenshots of `claude mcp list`, an MCP call, and the CloudTrail
    console filtered to `unforged-agent`.

**F. Post and submit (about 2.5 h)**
13. Fill every `[[MEASURE]]` and `[[TODO]]` in
    `planning/submission-post-draft.md` from `docs/measurements.md` only.
14. Demo video (90 s): three cards, Release goods, race. Rehearse once.
15. Repo public; clean-browser check from another network; Builder Center
    post with cover, 3 proof images, tags `#daily-life-enhancement`
    `#startups`, repo + live links.
16. Submit by 2 Oct 6:00 PM IST (6 h buffer before 3 Oct 12:29 IST).

## First message for a new session here

> Read CLAUDE.md, docs/PLAN.md (State, ARENA review, Next) and git log -15. The app is live at https://d1ajauwkb76on3.cloudfront.net; deploy with `AWS_PROFILE=unforged-agent pnpm run deploy`. Use the aws-mcp tools for AWS work. Do "Next, in order" from B. Bedrock quota: [raised / pending]. Demo lead: [screenshot + alert / alert only]. Files are in planning/samples/.
