import { dkimVerify } from "mailauth/lib/dkim/verify.js"
import { createHash } from "node:crypto"
import type { DNSResolver } from "mailauth"
import { simpleParser } from "mailparser"
import { demoBank } from "./banks.js"
import { rupeesToPaise } from "./money.js"
import { normaliseUtr } from "./verdict.js"
import type { Credit } from "./types.js"

const bankDomains: Record<string, string[]> = {
  hdfc: ["hdfcbank.net", "hdfcbank.com"],
  icici: ["icicibank.com"],
  sbi: ["sbi.co.in"],
  axis: ["axisbank.com"],
  kotak: ["kotak.com"],
}

export type ParsedAlert = Omit<Credit, "id">

export type AlertResult =
  | { ok: true; alert: ParsedAlert }
  | { ok: false; reason: string }

function bankFor(domain: string): string | null {
  const d = domain.toLowerCase()
  for (const [bank, domains] of Object.entries(bankDomains)) {
    if (domains.some((allowed) => d === allowed || d.endsWith(`.${allowed}`))) return bank
  }
  return null
}

const amountPattern = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i
const utrPattern = /(?:UPI|UTR|RRN|Ref(?:erence)?)[^\d]{0,30}(\d{12})\b/i
const creditedToYou = /credited\s+(?:to|in(?:to)?)\s+(?:your\s+)?(?:a\/c|acct|account)/i
const debitPattern = /\bdebit(?:ed)?\b/i

export function extractCredit(text: string): { amountPaise: number; utr: string } | null {
  if (!/credit/i.test(text)) return null
  if (debitPattern.test(text) && !creditedToYou.test(text)) return null
  const amount = text.match(amountPattern)
  const utr = text.match(utrPattern)
  if (!amount?.[1] || !utr?.[1]) return null
  const amountPaise = rupeesToPaise(amount[1])
  if (amountPaise === null) return null
  return { amountPaise, utr: normaliseUtr(utr[1]) }
}

export type Signature = { domain: string; selector: string; result: string; aligned: boolean; detail: string | null }

export type SignatureReport = {
  from: string | null
  signatures: Signature[]
  signer: string | null
  fingerprint: string | null
  claimBlocked: string | null
  alert: AlertResult
}

function relaxedBodyHash(body: string): string {
  const lines = body.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").replace(/ $/, ""))
  while (lines.length && lines[lines.length - 1] === "") lines.pop()
  return createHash("sha256").update(lines.length ? `${lines.join("\r\n")}\r\n` : "").digest("hex")
}

function claimKey(text: string, from: string, signedHeaders: string, lengthLimited: boolean): { key: string | null; blocked: string | null } {
  if (lengthLimited) return { key: null, blocked: "The signature covers only part of the body (l= tag), so the email could be extended without breaking it." }
  if (!signedHeaders.split(":").map((h) => h.trim().toLowerCase()).includes("date")) return { key: null, blocked: "The signature does not cover the Date header, so the email cannot be told apart from a resent copy." }
  const end = text.search(/\r?\n\r?\n/)
  const head = end < 0 ? text : text.slice(0, end)
  const dates = [...head.matchAll(/^date:[ \t]*(.*(?:\r?\n[ \t].*)*)/gim)].map((m) => m[1]!.replace(/\s+/g, " ").trim())
  if (dates.length !== 1) return { key: null, blocked: "The email must have exactly one Date header." }
  const body = end < 0 ? "" : text.slice(end).replace(/^\r?\n\r?\n/, "")
  const address = from.toLowerCase()
  return { key: createHash("sha256").update([address.split("@").pop()!, address, dates[0], relaxedBodyHash(body)].join("\n")).digest("hex"), blocked: null }
}

const maxSignatures = 8

function signatureCount(raw: string | Buffer): number {
  const text = typeof raw === "string" ? raw : raw.toString("latin1")
  const end = text.search(/\r?\n\r?\n/)
  return (text.slice(0, end < 0 ? text.length : end).match(/^dkim-signature:/gim) ?? []).length
}

export async function inspectSignature(raw: string | Buffer, resolver?: DNSResolver, demoSenders: string[] = []): Promise<SignatureReport> {
  if (signatureCount(raw) > maxSignatures) {
    return { from: null, signatures: [], signer: null, fingerprint: null, claimBlocked: null, alert: { ok: false, reason: `More than ${maxSignatures} DKIM signatures. Paste the original email.` } }
  }
  const dkim = await dkimVerify(raw, resolver ? { resolver } : {})
  const signed = dkim.results.filter((r) => r.signingDomain)
  const signatures = signed.map((r) => ({
    domain: r.signingDomain!.toLowerCase(),
    selector: r.selector ?? "",
    result: r.status.result,
    aligned: Boolean(r.status.aligned),
    detail: r.status.comment ?? null,
  }))
  const from = dkim.fromFields === 1 && dkim.headerFrom.length === 1 ? dkim.headerFrom[0]! : null
  const aligned = dkim.results.filter((r) => r.signingDomain && r.status.result === "pass" && r.status.aligned)
  const passing = aligned.find((r) => !r.canonBodyLengthLimited) ?? aligned[0]
  const signer = passing?.signingDomain?.toLowerCase() ?? null
  const claim = passing && signer && from ? claimKey(typeof raw === "string" ? raw : raw.toString("latin1"), from, passing.signingHeaders?.keys ?? "", Boolean(passing.canonBodyLengthLimited)) : { key: null, blocked: null }
  const fullBody = signatures.filter((_, i) => !signed[i]!.canonBodyLengthLimited)
  return { from, signatures, signer, fingerprint: claim.key, claimBlocked: claim.blocked, alert: await decide(raw, from, fullBody, demoSenders) }
}

export async function verifyAlert(raw: string | Buffer, resolver?: DNSResolver, demoSenders: string[] = []): Promise<AlertResult> {
  return (await inspectSignature(raw, resolver, demoSenders)).alert
}

async function decide(raw: string | Buffer, from: string | null, signatures: Signature[], demoSenders: string[]): Promise<AlertResult> {
  if (!from) return { ok: false, reason: "The email must have exactly one From address." }
  const fromDomain = from.split("@").pop()!.toLowerCase()
  const fromBank = bankFor(fromDomain) ?? (demoSenders.includes(from.toLowerCase()) ? demoBank : null)
  if (!fromBank) return { ok: false, reason: `${fromDomain} is not on the bank allowlist.` }

  const signedByBank = (s: Signature) => (fromBank === demoBank ? s.domain === fromDomain : bankFor(s.domain) === fromBank)
  const passing = signatures.find((s) => s.result === "pass" && s.aligned && signedByBank(s))
  if (!passing) {
    return { ok: false, reason: `No passing DKIM signature from ${fromDomain}. The email may be edited or forged.` }
  }

  const mail = await simpleParser(raw)
  const text = mail.text ?? (typeof mail.html === "string" ? mail.html.replace(/<[^>]+>/g, " ") : "")
  const credit = extractCredit(text.replace(/\s+/g, " "))
  if (!credit) return { ok: false, reason: "The signed email is genuine but no UPI credit amount and UTR were found in it." }

  return {
    ok: true,
    alert: {
      bank: fromBank,
      utr: credit.utr,
      amountPaise: credit.amountPaise,
      creditedAt: (mail.date ?? new Date()).toISOString(),
      dkimDomain: passing.domain,
      source: "dkim-email",
    },
  }
}
