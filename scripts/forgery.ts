import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { meta, post, requireEnv, table, writeResult } from "./lib.js"

type Verdict = "VERIFIED" | "UNREADABLE" | "NOT_FOUND_YET" | "AMOUNT_MISMATCH" | "PAYEE_MISMATCH" | "ALREADY_CLAIMED"
type Truth = { utr: string | null; amountPaise: number | null; payeeVpa: string | null }
type Case = { name: string; file: string; expected: Verdict; orderRef?: string; truth?: Truth }
type Manifest = { alert: string; vpas: string[]; cases: Case[] }
type Read = { readable: boolean; utr: string | null; amountPaise: number | null; payeeVpa: string | null }
type CheckBody = { verdict?: string; reason?: string; read?: Read; retries?: number; error?: string }

const fields = ["utr", "amountPaise", "payeeVpa"] as const

function normalise(field: (typeof fields)[number], value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) return null
  if (field === "utr") return String(value).replace(/\D/g, "")
  if (field === "payeeVpa") return String(value).trim().toLowerCase()
  return Number(value)
}

const manifestPath = resolve(requireEnv("FORGERY_MANIFEST"))
const base = dirname(manifestPath)
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest
const info = meta()

const shop = await post<{ shopId?: string; token?: string; error?: string }>("/api/shops", { name: `forgery-${Date.now()}`, vpas: manifest.vpas })
if (shop.status !== 201 || !shop.body.token) {
  console.error(`Shop creation failed: HTTP ${shop.status} ${JSON.stringify(shop.body)}`)
  process.exit(1)
}
const headers = { "x-shop-token": shop.body.token }
const alert = await post<unknown>("/api/alerts", { raw: await readFile(resolve(base, manifest.alert), "utf8") }, headers)
if (alert.status !== 201 && alert.status !== 200) {
  console.error(`Alert rejected: HTTP ${alert.status} ${JSON.stringify(alert.body)}`)
  process.exit(1)
}

const results = []
for (const [i, c] of manifest.cases.entries()) {
  const path = resolve(base, c.file)
  const ext = path.split(".").pop()!.toLowerCase()
  const image = (await readFile(path)).toString("base64")
  const res = await post<CheckBody>("/api/check", { image, format: ext, orderRef: c.orderRef ?? `forgery-${i + 1}-${c.name}` }, headers)
  const read = res.body.read
  const fieldMatches = c.truth
    ? Object.fromEntries(fields.map((f) => [f, normalise(f, read?.[f]) === normalise(f, c.truth![f])]))
    : null
  results.push({ name: c.name, file: c.file, expected: c.expected, actual: res.body.verdict ?? `HTTP ${res.status}`, pass: res.body.verdict === c.expected, status: res.status, ms: res.ms, truth: c.truth ?? null, fieldMatches, response: res.body })
  console.error(`${c.name}: expected ${c.expected}, got ${res.body.verdict ?? `HTTP ${res.status}`}`)
}

const scored = results.filter((r) => r.fieldMatches)
const accuracy = Object.fromEntries(fields.map((f) => [f, { correct: scored.filter((r) => r.fieldMatches![f]).length, total: scored.length }]))
const allFields = scored.filter((r) => fields.every((f) => r.fieldMatches![f])).length
const summary = { verdictsCorrect: results.filter((r) => r.pass).length, total: results.length, extraction: accuracy, allFieldsCorrect: { correct: allFields, total: scored.length } }

const file = await writeResult("forgery", { ...info, finishedAt: new Date().toISOString(), manifest: manifestPath, shopId: shop.body.shopId, alert: { status: alert.status, body: alert.body }, summary, results })

const mark = (m: Record<string, boolean> | null, f: string) => (m ? (m[f] ? "yes" : "no") : "")
console.log("## Forgery matrix\n")
console.log(
  table(
    ["Case", "Expected", "Actual", "Pass", "UTR read", "Amount read", "Payee read", "ms"],
    results.map((r) => [r.name, r.expected, r.actual, r.pass ? "yes" : "no", mark(r.fieldMatches, "utr"), mark(r.fieldMatches, "amountPaise"), mark(r.fieldMatches, "payeeVpa"), Math.round(r.ms)]),
  ),
)
console.log(`\nVerdicts correct: ${summary.verdictsCorrect}/${summary.total}`)
console.log()
console.log(
  table(
    ["Field", "Correct"],
    [...fields.map((f) => [f, `${accuracy[f]!.correct}/${accuracy[f]!.total}`]), ["all three", `${allFields}/${scored.length}`]],
  ),
)
console.log(`\nRaw: ${file}`)
