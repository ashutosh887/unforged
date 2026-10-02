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
every Nova model (for example `L-210172B5`, Nova 2 Lite). Raising it needs an
AWS Support case.

Consequence in code: `/api/check` tries each reader in `MODEL_ID`, set in
`cdk.json`: Nova 2 Lite, then Claude Haiku 4.5, then Amazon Textract. A model
out of daily quota is skipped for 15 minutes. If every reader fails, the route
returns 503 with nothing claimed. It never turns a reader failure into a
verdict. Textract reads every screenshot today. `docs/measurements.md` §8
measures it.

## Not run yet

- A real bank alert: its DKIM result, its UTR format, and the DNS key lookup
  time from inside Lambda.
- Real UPI screenshots: Textract, and Nova 2 Lite against Claude Haiku 4.5 if
  the Bedrock quota is raised.
