# Spikes

Only results from real runs. Each entry carries its date.

## Bedrock vision access (1 Oct 2026, us-east-1, as `unforged-agent`)

A two-token `converse` call ("Reply OK") to each of these models returned
`ThrottlingException: Too many tokens per day`:

- `us.amazon.nova-2-lite-v1:0`
- `amazon.nova-lite-v1:0`, `amazon.nova-pro-v1:0`, `us.amazon.nova-pro-v1:0`
- `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `global.anthropic.claude-haiku-4-5-20251001-v1:0`
- `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

Service Quotas shows the daily token quota at `0.0` and not adjustable for
every Nova model (for example `L-210172B5`, Nova 2 Lite). The account needs a
quota increase through AWS Support before any screenshot can be read.

Consequence in code: `/api/check` tries each model in `MODEL_ID` (comma
separated, Nova 2 Lite then Claude Haiku 4.5) and returns 503 with nothing
claimed when all fail. It never turns a reader failure into a verdict.

## Bank alert DKIM and UTR

Pending the real `.eml`.

## Screenshot extraction (Nova 2 Lite vs Claude Haiku 4.5)

Pending the quota increase and the five screenshots.

## DKIM DNS lookup from Lambda

Pending the real bank's signing domain and selector; `POST /api/spike/dkim`.
