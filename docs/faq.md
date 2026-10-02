# Questions a judge asks

**What does Unforged do, in one sentence?**
It checks a buyer's UPI payment screenshot against the seller's own bank
credit alert, which the bank signs with DKIM, and lets each signed credit pay
for one order only.

**Why not just open the bank app and check the UTR?**
That is good advice, and it misses one case. A real screenshot from last
week's order carries a real UTR that matches a real credit every time it is
shown. Matching tells you the payment happened. It does not tell you this
payment has not already paid for another order. Unforged answers both.

**Why email and not SMS?**
SMS alerts carry no signature. Anyone types a message that looks like one.
Bank emails carry a DKIM signature checked against the bank's own DNS key, so
an edited or invented email fails. That is the whole reason to use email.

**What if a bank does not sign its alerts?**
Then Unforged cannot check that bank, and it says so instead of guessing. The
allowlist names HDFC, ICICI, SBI, Axis and Kotak domains. No real alert from
any of them has been tested yet, and every bank-side number in
[`measurements.md`](measurements.md) waits for one.

**Then how do you know the signature check works?**
It was run on 80 real signed emails from a public mailing-list archive. 37
verified as archived. Changing one character broke all 37, and rewriting the
From header to a bank address got all 37 rejected. Anyone reruns this with
`pnpm measure:signature`. These are real signatures from real senders, but not
banks.

**Why Aurora DSQL and not DynamoDB?**
DynamoDB gives the same claim-once result with `TransactWriteItems` and an
`attribute_not_exists` condition. I chose DSQL because the data is read
relationally, such as credits by shop and UTR or the claim that beat yours,
and because the guarantee becomes a plain unique key in one SQL transaction
that any Postgres reader can audit. DSQL also needs no VPC and no stored
password, since IAM signs a short-lived token. The price is optimistic
concurrency, which the claim path handles with a bounded retry.

**How do you know claim-once holds under load?**
`POST /api/race` fires 50 claims at one credit at the same instant. In 20
rounds, the unique key let exactly one through every time. The same 50 claims
against a check-then-insert table were approved 1,000 times for 20 credits.
`pnpm measure:race` reruns it.

**What does the KMS receipt add?**
A receipt the buyer can keep and anyone can check. AWS KMS signs it with a
private key that never leaves KMS, and the public key is published. Each
receipt also carries the hash of the one before it, so a removed receipt
breaks the chain. A 32-receipt chain audited offline showed 0 breaks.

**Who reads the screenshot, Bedrock or Textract?**
Today, Amazon Textract. The code tries Bedrock models first, but this
account's Bedrock quota is 0 tokens a day, so every live read falls through to
Textract. Textract returns text lines with positions, and code picks the UTR,
amount and payee. If a field has two candidates, code leaves it empty and the
verdict is `UNREADABLE`.

**Has it been tested on real UPI screenshots?**
No. The two screenshots on the page are samples made for the demo and are
labelled that way. Textract read every field right on 10 of 10 reads of each,
which says nothing about compressed, cropped phone screenshots.

**What happens to the emails I paste?**
`/api/verify` stores nothing. `/api/records/claim` stores the signer domain,
a hash that identifies the email, your claim reference and the time. It never
stores the body. Screenshots sent to `/api/check` go to a private S3 bucket
that deletes them after 24 hours. `/api/read` stores nothing.

**What does it cost to run?**
Every part scales to zero: Lambda, API Gateway, Aurora DSQL, Textract per page
and KMS per signature, plus a monthly fee for each KMS key (see
[AWS KMS pricing](https://aws.amazon.com/kms/pricing/)). I have not measured a
cost per check, so I do not quote one.

**What did the coding agent do?**
Claude Code, connected to AWS through the AWS MCP Server as the IAM user
`unforged-agent`, wrote the CDK stack, deployed it, ran the migrations and
every measurement. Live runs caught the same bug twice: an async unique index
that enforced nothing while it was building. CloudTrail recorded 1,198 events
for that user between 1 Oct 18:40 and 2 Oct 13:35 IST. The proof is in
[`agent-proof/`](agent-proof/).

**What is not built?**
No login, no fraud score, no WhatsApp bot, no multi-region setup and no
automatic alert forwarding. A shop gets a private link instead of an account.
Forwarding alerts through Amazon SES is the next step.

**Is this only for India?**
UPI is the first case. The mechanism works for any signed email: a refund
confirmation claimed against one return, a payslip claimed once per loan
application, a booking confirmation claimed once. `/api/records/claim` already
takes any signed email.
