import { createHash } from "node:crypto"
import { Resolver } from "node:dns/promises"
import type { DNSResolver } from "mailauth"
import sample from "../../web/public/samples/sample.eml"
import { inspectSignature } from "../core/alert.js"
import { json, pool, type Result } from "./http.js"

type Status = {
  ok: boolean
  checkedAt: string
  dkim: { domain: string | null; selector: string | null; keySha256: string | null; lookupMs: number | null; verifiesSample: boolean; error: string | null }
  dsql: { reachable: boolean; ms: number; error: string | null }
  receiptKeyId: string | null
  readers: { check: string[]; read: string[] }
}

const ttlMs = 60_000
let cached: { at: number; status: Status } | undefined

function failure(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e) return String((e as { code: unknown }).code)
  return e instanceof Error ? e.name : "Error"
}

function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })), ms))])
}

function tag(header: string, name: string): string | null {
  return header.match(new RegExp(`[;\\s]${name}=([^;\\s]+)`))?.[1]?.toLowerCase() ?? null
}

async function dkim(): Promise<Status["dkim"]> {
  const header = sample.match(/^DKIM-Signature:[^\n]*(?:\r?\n[ \t][^\n]*)*/im)?.[0] ?? ""
  const domain = tag(header, "d")
  const selector = tag(header, "s")
  if (!domain || !selector) return { domain, selector, keySha256: null, lookupMs: null, verifiesSample: false, error: "NO_SIGNATURE" }
  const name = `${selector}._domainkey.${domain}`
  const dns = new Resolver({ timeout: 3000, tries: 2 })
  const started = performance.now()
  try {
    const records = await dns.resolveTxt(name)
    const lookupMs = Math.round(performance.now() - started)
    const key = records.map((chunks) => chunks.join("")).map((r) => r.match(/(?:^|;)\s*p=([^;]*)/)?.[1]?.replace(/\s/g, "") ?? "").find(Boolean) ?? ""
    const keySha256 = key ? createHash("sha256").update(Buffer.from(key, "base64")).digest("hex") : null
    const resolver = (async (lookup: string, type: string) => (lookup === name && type === "TXT" ? records : dns.resolve(lookup, type))) as DNSResolver
    const report = await inspectSignature(sample, resolver)
    const verifiesSample = report.signer === domain && report.signatures.some((s) => s.domain === domain && s.result === "pass")
    return { domain, selector, keySha256, lookupMs, verifiesSample, error: keySha256 ? null : "NO_KEY" }
  } catch (e) {
    return { domain, selector, keySha256: null, lookupMs: Math.round(performance.now() - started), verifiesSample: false, error: failure(e) }
  }
}

async function dsql(): Promise<Status["dsql"]> {
  const started = performance.now()
  try {
    await within(5000, pool().query("SELECT 1"))
    return { reachable: true, ms: Math.round(performance.now() - started), error: null }
  } catch (e) {
    return { reachable: false, ms: Math.round(performance.now() - started), error: failure(e) }
  }
}

async function measure(): Promise<Status> {
  const [key, db] = await Promise.all([dkim(), dsql()])
  return {
    ok: key.verifiesSample && db.reachable,
    checkedAt: new Date().toISOString(),
    dkim: key,
    dsql: db,
    receiptKeyId: process.env.RECEIPT_KEY_ID ?? null,
    readers: { check: (process.env.MODEL_ID ?? "").split(",").map((m) => m.trim()).filter(Boolean), read: ["textract"] },
  }
}

export async function handler(): Promise<Result> {
  const now = Date.now()
  if (!cached || now - cached.at > ttlMs) cached = { at: now, status: await measure() }
  return json(cached.status.ok ? 200 : 503, { ...cached.status, cachedForMs: Math.max(0, ttlMs - (now - cached.at)) })
}
