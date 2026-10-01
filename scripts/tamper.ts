import { readFile } from "node:fs/promises"
import { meta, post, requireEnv, table, writeResult } from "./lib.js"

type Case = { name: string; expected: "stored" | "rejected"; raw: string }

function splitMessage(raw: string): { head: string; sep: string; body: string } {
  const at = raw.search(/\r?\n\r?\n/)
  if (at < 0) throw new Error("no header/body separator in the email")
  const sep = raw.slice(at).match(/^\r?\n\r?\n/)![0]
  return { head: raw.slice(0, at), sep, body: raw.slice(at + sep.length) }
}

function changeOneBodyDigit(raw: string): string {
  const { head, sep, body } = splitMessage(raw)
  const i = body.search(/[0-9]/)
  if (i < 0) throw new Error("no digit in the email body")
  const next = String((Number(body[i]) + 1) % 10)
  return head + sep + body.slice(0, i) + next + body.slice(i + 1)
}

function lookAlikeFrom(raw: string): string {
  const { head, sep, body } = splitMessage(raw)
  const swapped = head.replace(/^(From:[^\r\n]*@)([A-Za-z0-9.-]+)/im, (_m, prefix: string, domain: string) => `${prefix}${domain.replace(/\.([a-z]+)$/i, "-alerts.$1")}`)
  if (swapped === head) throw new Error("no From address in the headers")
  return swapped + sep + body
}

const original = await readFile(requireEnv("ALERT_EML"), "utf8")
const vpas = requireEnv("SHOP_VPAS").split(",").map((v) => v.trim()).filter(Boolean)
const info = meta()

const shop = await post<{ shopId?: string; token?: string }>("/api/shops", { name: `tamper-${Date.now()}`, vpas })
if (shop.status !== 201 || !shop.body.token) {
  console.error(`shop creation failed: HTTP ${shop.status}`)
  process.exit(1)
}
const headers = { "x-shop-token": shop.body.token }

const cases: Case[] = [
  { name: "One body digit changed", expected: "rejected", raw: changeOneBodyDigit(original) },
  { name: "From domain swapped for a look-alike", expected: "rejected", raw: lookAlikeFrom(original) },
  { name: "Original, byte for byte (control)", expected: "stored", raw: original },
]

const results = []
const rows: (string | number)[][] = []
for (const c of cases) {
  const res = await post<{ error?: string; credit?: unknown }>("/api/alerts", { raw: c.raw }, headers)
  const outcome = res.status === 422 ? "rejected" : res.status === 200 || res.status === 201 ? "stored" : `HTTP ${res.status}`
  results.push({ ...c, raw: undefined, status: res.status, ms: res.ms, body: res.body, outcome })
  rows.push([c.name, c.expected, outcome, res.body.error ?? "", Math.round(res.ms)])
}

const file = await writeResult("tamper", { ...info, shopId: shop.body.shopId, results, finishedAt: new Date().toISOString() })
console.log("## Tampered alerts against /api/alerts\n")
console.log(table(["Case", "Expected", "Result", "Reason", "ms"], rows))
console.log(`\nRaw: ${file}`)
