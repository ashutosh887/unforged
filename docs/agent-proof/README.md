# Agent proof

Claude Code built, deployed and measured Unforged. Its AWS access ran through
the AWS MCP Server, as one IAM user, so every call it made is in CloudTrail
under that user's name. This folder holds the evidence.

## 1. The MCP connection

[`mcp-connected.txt`](mcp-connected.txt) has the output of `claude mcp list`
and `claude mcp get aws-mcp` from 1 Oct. The server is `aws-mcp`, run as
`uvx mcp-proxy-for-aws@latest https://aws-mcp.us-east-1.api.aws/mcp`, with
`AWS_PROFILE=unforged-agent` and `AWS_REGION=us-east-1` in its environment.

[`mcp-list.txt`](mcp-list.txt) and [`mcp-list.png`](mcp-list.png) show
`claude mcp list` again on 2 Oct, with `aws-mcp` connected.

## 2. The IAM principal

The same file shows `aws sts get-caller-identity --profile unforged-agent`
returning `arn:aws:iam::960149837193:user/unforged-agent`. It is an IAM user,
not the root account. Deploys ran as
`AWS_PROFILE=unforged-agent pnpm run deploy`.

## 3. The CloudTrail export

[`cloudtrail-unforged-agent.json`](cloudtrail-unforged-agent.json) holds 1,198
management events for `unforged-agent`, from 1 Oct 18:40 IST to 2 Oct 13:35
IST. Nine of them are `CallReadWriteTool` events from
`aws-mcp.amazonaws.com`, the MCP Server's own record of the agent's calls.
[`scripts/agent-trail.sh`](../../scripts/agent-trail.sh) makes the export.
[`cloudtrail-summary.png`](cloudtrail-summary.png) counts the events by
service. It is drawn from the export, not a console screenshot.

CloudTrail lookup covers management events only. Data-plane calls such as
Bedrock `Converse` and Lambda `Invoke` are not in the export.

## 4. The session log

[`sessions.md`](sessions.md) records what the agent did on 1 and 2 Oct: the
deploys, the checks it ran through the MCP Server, and the live race that
showed an async unique index enforcing nothing while it was building.
