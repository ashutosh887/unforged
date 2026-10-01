import { fmtMs, intEnv, meta, percentile, post, table, writeResult } from "./lib.js"

type RaceBody = {
  n: number
  utr: string
  guarded: { verified: number; alreadyClaimed: number; errors: number; retries: number; ms: number }
  naive: { accepted: number; errors: number; ms?: number }
}

type Round = { round: number; status: number; clientMs: number; body: RaceBody | null; error?: unknown }

function isRaceBody(value: unknown): value is RaceBody {
  return typeof value === "object" && value !== null && "guarded" in value && "naive" in value
}

const rounds = intEnv("ROUNDS", 20)
const n = intEnv("N", 50)
const info = meta()
const results: Round[] = []

for (let round = 1; round <= rounds; round++) {
  const res = await post<unknown>("/api/race", { n })
  const ok = res.status === 200 && isRaceBody(res.body)
  results.push({ round, status: res.status, clientMs: res.ms, body: ok ? (res.body as RaceBody) : null, ...(ok ? {} : { error: res.body }) })
  const b = ok ? (res.body as RaceBody) : null
  console.error(`round ${round}/${rounds}: status ${res.status}${b ? `, guarded winners ${b.guarded.verified}, naive winners ${b.naive.accepted}` : ""}`)
}

const good = results.flatMap((r) => (r.body ? [r.body] : []))
const guardedMs = good.map((b) => b.guarded.ms)
const naiveMs = good.flatMap((b) => (typeof b.naive.ms === "number" ? [b.naive.ms] : []))
const clientMs = results.filter((r) => r.body).map((r) => r.clientMs)
const roundsWithExactlyOneGuarded = good.filter((b) => b.guarded.verified === 1).length
const roundsWithMoreThanOneNaive = good.filter((b) => b.naive.accepted > 1).length

const summary = {
  rounds,
  n,
  successfulRounds: good.length,
  roundsWithExactlyOneGuardedWinner: roundsWithExactlyOneGuarded,
  roundsWithMoreThanOneNaiveWinner: roundsWithMoreThanOneNaive,
  guardedWinnersTotal: good.reduce((s, b) => s + b.guarded.verified, 0),
  naiveWinnersTotal: good.reduce((s, b) => s + b.naive.accepted, 0),
  guardedErrorsTotal: good.reduce((s, b) => s + b.guarded.errors, 0),
  naiveErrorsTotal: good.reduce((s, b) => s + b.naive.errors, 0),
  occRetriesTotal: good.reduce((s, b) => s + b.guarded.retries, 0),
  guardedBatchMs: { p50: percentile(guardedMs, 50), p95: percentile(guardedMs, 95) },
  naiveBatchMs: naiveMs.length ? { p50: percentile(naiveMs, 50), p95: percentile(naiveMs, 95) } : null,
  clientRoundTripMs: { p50: percentile(clientMs, 50), p95: percentile(clientMs, 95) },
}

const file = await writeResult("race", { ...info, finishedAt: new Date().toISOString(), summary, results })

console.log(`## Race: ${rounds} rounds x ${n} concurrent claims of one credit\n`)
console.log(
  table(
    ["Round", "Unique index winners", "Already claimed", "Errors", "OCC retries", "Naive winners", "Naive errors", "Batch ms (index)", "Round trip"],
    results.map((r) =>
      r.body
        ? [r.round, r.body.guarded.verified, r.body.guarded.alreadyClaimed, r.body.guarded.errors, r.body.guarded.retries, r.body.naive.accepted, r.body.naive.errors, fmtMs(r.body.guarded.ms), fmtMs(r.clientMs)]
        : [r.round, `HTTP ${r.status}`, "", "", "", "", "", "", fmtMs(r.clientMs)],
    ),
  ),
)
console.log()
console.log(
  table(
    ["Metric", "Unique index", "Naive control"],
    [
      ["Rounds with exactly one winner", `${roundsWithExactlyOneGuarded}/${good.length}`, `${good.filter((b) => b.naive.accepted === 1).length}/${good.length}`],
      ["Rounds with more than one winner", `${good.filter((b) => b.guarded.verified > 1).length}/${good.length}`, `${roundsWithMoreThanOneNaive}/${good.length}`],
      ["Total winners", summary.guardedWinnersTotal, summary.naiveWinnersTotal],
      ["Batch p50", fmtMs(summary.guardedBatchMs.p50), fmtMs(summary.naiveBatchMs?.p50 ?? null)],
      ["Batch p95", fmtMs(summary.guardedBatchMs.p95), fmtMs(summary.naiveBatchMs?.p95 ?? null)],
      ["Round trip p50 (both arms)", fmtMs(summary.clientRoundTripMs.p50), ""],
      ["Round trip p95 (both arms)", fmtMs(summary.clientRoundTripMs.p95), ""],
    ],
  ),
)
console.log(`\nRaw: ${file}`)
