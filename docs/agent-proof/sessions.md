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
