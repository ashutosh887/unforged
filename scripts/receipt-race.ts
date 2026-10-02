import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { intEnv, meta, percentile, post, requireEnv, writeResult } from "./lib.js"

type Claim = { verdict?: string; reason?: string; retries?: number; receipt?: { seq: number } }

const dir = requireEnv("EML_DIR")
const concurrency = intEnv("CONCURRENCY", 8)
const files = (await readdir(dir)).filter((f) => f.endsWith(".eml")).sort().slice(0, intEnv("LIMIT", 24))
const ledger = `chain-${Date.now()}`
const results: { file: string; status: number; ms: number; verdict: string | null; seq: number | null; retries: number | null; reason: string | null }[] = []
for (let i = 0; i < files.length; i += concurrency) {
  const wave = files.slice(i, i + concurrency)
  const out = await Promise.all(
    wave.map(async (file) => {
      const raw = await readFile(join(dir, file), "utf8")
      const res = await post<Claim>("/api/records/claim", { raw, claimRef: `chain test ${file}`, ledger })
      return { file, status: res.status, ms: Math.round(res.ms), verdict: res.body.verdict ?? null, seq: res.body.receipt?.seq ?? null, retries: res.body.retries ?? null, reason: res.body.reason ?? null }
    }),
  )
  results.push(...out)
}
const seqs = results.flatMap((r) => (r.seq === null ? [] : [r.seq])).sort((a, b) => a - b)
const summary = {
  ledger,
  concurrency,
  sent: results.length,
  verified: results.filter((r) => r.verdict === "VERIFIED").length,
  receipts: seqs.length,
  distinctSeqs: new Set(seqs).size,
  gapless: seqs.every((s, i) => s === i + 1),
  retries: results.reduce((n, r) => n + (r.retries ?? 0), 0),
  statuses: Object.fromEntries([...new Set(results.map((r) => r.status))].map((s) => [s, results.filter((r) => r.status === s).length])),
  ms: { p50: percentile(results.map((r) => r.ms), 50), p95: percentile(results.map((r) => r.ms), 95) },
}
const file = await writeResult("receipt-race", { ...meta(), summary, results })
console.log(JSON.stringify(summary, null, 2))
console.log(`Raw: ${file}`)
