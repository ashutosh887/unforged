import { fmtMs, intEnv, mboxMessages, meta, percentile, post, table, writeResult } from "./lib.js"

type Claim = { verdict?: string; reason?: string; retries?: number; error?: string }

const source = process.env.MBOX_URL ?? "https://lists.gnu.org/archive/mbox/help-gnu-emacs/2026-09"
const rounds = intEnv("ROUNDS", 10)
const n = intEnv("N", 50)
const skip = intEnv("SKIP", 1)
const info = meta()

const res = await fetch(source)
if (!res.ok) {
  console.error(`could not fetch ${source}: HTTP ${res.status}`)
  process.exit(1)
}
const candidates = mboxMessages(await res.text()).slice(skip - 1)

const results: { round: number; verified: number; alreadyClaimed: number; other: Record<string, number>; reasons: string[]; retries: number; ms: number[] }[] = []
const stamp = Date.now()
const ledger = `race-${stamp}`
let used = 0
for (const raw of candidates) {
  if (results.length >= rounds) break
  const probe = await post<{ signer: string | null; signatures?: unknown[] }>("/api/verify", { raw })
  if (!probe.body.signer) continue
  used++
  const replies = await Promise.all(Array.from({ length: n }, (_, i) => post<Claim>("/api/records/claim", { raw, ledger, claimRef: `race-${stamp}-${results.length + 1}-${i + 1}` })))
  const tally = { verified: 0, alreadyClaimed: 0, other: {} as Record<string, number>, reasons: [] as string[], retries: 0 }
  for (const r of replies) {
    if (r.body.verdict === "VERIFIED") tally.verified++
    else if (r.body.verdict === "ALREADY_CLAIMED") tally.alreadyClaimed++
    else {
      const key = `${r.status} ${r.body.verdict ?? r.body.error ?? ""}`.trim()
      tally.other[key] = (tally.other[key] ?? 0) + 1
      if (r.body.reason) tally.reasons.push(r.body.reason)
    }
    tally.retries += r.body.retries ?? 0
  }
  results.push({ round: results.length + 1, ...tally, ms: replies.map((r) => r.ms) })
  console.error(`round ${results.length}: ${tally.verified} verified, ${tally.alreadyClaimed} already claimed, other ${JSON.stringify(tally.other)}`)
  await new Promise((r) => setTimeout(r, 3000))
}

const all = results.flatMap((r) => r.ms)
const summary = {
  source,
  ledger,
  rounds: results.length,
  claimsPerRound: n,
  exactlyOneWinner: results.filter((r) => r.verified === 1 && r.alreadyClaimed === n - 1).length,
  totalVerified: results.reduce((a, r) => a + r.verified, 0),
  totalOther: results.reduce((a, r) => a + Object.values(r.other).reduce((x, y) => x + y, 0), 0),
  retries: results.reduce((a, r) => a + r.retries, 0),
  requestMs: { p50: percentile(all, 50), p95: percentile(all, 95) },
}
const file = await writeResult("record-race", { ...info, summary, results, finishedAt: new Date().toISOString() })
console.log(`## ${n} simultaneous claims of one signed email, ${results.length} rounds\n`)
console.log(
  table(
    ["Metric", "Result"],
    [
      ["Rounds with exactly one VERIFIED and the rest ALREADY_CLAIMED", `${summary.exactlyOneWinner}/${summary.rounds}`],
      ["Total VERIFIED (1 is correct per round)", summary.totalVerified],
      ["Other responses (errors, throttles)", summary.totalOther],
      ["OCC retries reported", summary.retries],
      ["Request time p50 / p95 (laptop in India → CloudFront)", `${fmtMs(summary.requestMs.p50)} / ${fmtMs(summary.requestMs.p95)}`],
    ],
  ),
)
console.log(`\nRaw: ${file}`)
