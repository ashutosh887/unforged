# Agent sessions

Claude Code (Opus 5.5) built and deployed Unforged. Its AWS calls run as the
IAM user `unforged-agent`, through the CLI profile of the same name and the
AWS MCP Server (`aws-mcp`, pinned to that profile). CloudTrail attributes
every call to that user; `scripts/agent-trail.sh` exports them.

## 1 Oct 2026, evening IST

- Created `unforged-agent`, connected the AWS MCP Server, bootstrapped CDK,
  deployed the `Unforged` stack (CloudFront, S3, HTTP API, Lambdas, a new
  Aurora DSQL cluster) and ran the migrate Lambda.
- Found that every Bedrock model in the account has a daily token quota of 0
  (`docs/spikes.md`) and made `/api/check` fail closed: 503, nothing claimed.

### The agent catches a broken once-only rule

The first live race returned this:

```json
{"n":50,"guarded":{"verified":50,"alreadyClaimed":0,"errors":0,"retries":145,"ms":1408},"naive":{"accepted":50,"errors":0}}
```

Fifty approvals for one bank credit on the guarded path. The agent queried
`sys.jobs` on the DSQL cluster:

```
public.claims_once  INDEX_BUILD  failed  found duplicate key(s) while validating index uniqueness
```

Cause: `CREATE UNIQUE INDEX ASYNC` returns at once and builds in the
background. The race ran seconds after migrate, while `claims_once` was still
building; its duplicate rows then made the build fail, so the index never
enforced anything. The claim code was correct; the deployment order was not.

Fix: removed the race rows, rebuilt the index, and changed the migrate Lambda
to `CALL sys.wait_for_job` on every async index and throw if any build fails
(`fix(db): migrate waits for async index builds to finish`). The race after
the fix, three rounds:

```json
{"n":50,"guarded":{"verified":1,"alreadyClaimed":49,"errors":0,"retries":5,"ms":566},"naive":{"accepted":50,"errors":0}}
{"n":50,"guarded":{"verified":1,"alreadyClaimed":49,"errors":0,"retries":14,"ms":178},"naive":{"accepted":50,"errors":0}}
{"n":50,"guarded":{"verified":1,"alreadyClaimed":49,"errors":0,"retries":19,"ms":199},"naive":{"accepted":50,"errors":0}}
```

## 1 Oct 2026, late evening IST: checks through the AWS MCP Server

Every call below went through the `aws-mcp` tools (`aws___run_script`), not
the CLI. `sts:GetCallerIdentity` returned
`arn:aws:iam::960149837193:user/unforged-agent`.

| Call | Result |
| --- | --- |
| `cloudformation:DescribeStacks Unforged` | `UPDATE_COMPLETE`, URL output `https://d1ajauwkb76on3.cloudfront.net` |
| `dsql:GetCluster ubud3ytzjhhzezzpiu3v5774de` | `ACTIVE` |
| `service-quotas:ListServiceQuotas bedrock` | Nova 2 Lite tokens per day (`L-210172B5`, cross-region `L-AD940EDE`): 0, not adjustable |
| `bedrock-runtime:Converse` on Nova 2 Lite, Claude Haiku 4.5, Nova Lite | `ThrottlingException: Too many tokens per day` on all three |
| `support:DescribeSeverityLevels` | `SubscriptionRequiredException`: the limit case cannot be filed by API on Basic support; it goes through the console |
| `logs:FilterLogEvents` on the Check, Alerts and Race functions (24 h) | Check 1 invocation (max 2718 ms), Alerts 1 (477 ms), Race 39 (1947 ms) |
| `cloudtrail:LookupEvents Username=unforged-agent` | 825 events, 13:10–15:09 UTC (the newest calls appear after CloudTrail's delivery lag) |

## 2 Oct 2026: what the agent built, deployed by `unforged-agent`

- `POST /api/verify` (the `Verify` Lambda): a DKIM report for any email,
  storing nothing. Measured on 80 public-archive emails with
  `pnpm measure:signature`: 37/37 broken by a one-character edit, 37/37
  rejected with a bank From (`docs/measurements.md` §6).
- The shop ledger, `POST /api/ledger` (the `Books` Lambda). Its new
  `attempts_by_shop` index was built by invoking the migrate Lambda through
  the AWS MCP Server (`lambda:Invoke`, payload `{"applied":11,...,"status":"completed"}`).
- Amazon Textract as the last screenshot reader, so checks work while every
  Bedrock model's daily quota is 0. Models out of quota are benched for 15 min.
- Every deploy was `AWS_PROFILE=unforged-agent pnpm run deploy`; the stack was
  `UPDATE_COMPLETE` at 07:55 UTC, confirmed through `aws___run_script`
  (`sts:GetCallerIdentity` → `user/unforged-agent`).

`claude mcp list` (`mcp-list.txt`, `mcp-list.png`) shows `aws-mcp` connected.
The default health check timed out twice while `uvx` fetched
`mcp-proxy-for-aws@latest`; with `MCP_TIMEOUT=90000` it reports connected.

CloudTrail export refreshed (`scripts/agent-trail.sh`): **1,198 events** for
`unforged-agent`, 1 Oct 18:40 IST to 2 Oct 13:35 IST, including 9
`aws-mcp.amazonaws.com` `CallReadWriteTool` events, the MCP Server's own
record of the agent's calls. Summary image: `cloudtrail-summary.png`
(generated from the export, not a console screenshot). Lookup covers
management events only, so data-plane calls such as Bedrock `Converse` and
Lambda `Invoke` do not appear in it.
