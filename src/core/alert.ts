import { dkimVerify } from "mailauth/lib/dkim/verify.js"
import type { DNSResolver } from "mailauth"
import { simpleParser } from "mailparser"
import { rupeesToPaise } from "./money.js"
import { normaliseUtr } from "./verdict.js"
import type { Credit } from "./types.js"

export const bankDomains: Record<string, string[]> = {
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

export function extractCredit(text: string): { amountPaise: number; utr: string } | null {
  if (!/credit/i.test(text)) return null
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
  alert: AlertResult
}

const maxSignatures = 8

function signatureCount(raw: string | Buffer): number {
  const text = typeof raw === "string" ? raw : raw.toString("latin1")
  const end = text.search(/\r?\n\r?\n/)
  return (text.slice(0, end < 0 ? text.length : end).match(/^dkim-signature:/gim) ?? []).length
}

export async function inspectSignature(raw: string | Buffer, resolver?: DNSResolver): Promise<SignatureReport> {
  if (signatureCount(raw) > maxSignatures) {
    return { from: null, signatures: [], signer: null, alert: { ok: false, reason: `More than ${maxSignatures} DKIM signatures. Paste the original email.` } }
  }
  const dkim = await dkimVerify(raw, resolver ? { resolver } : {})
  const signatures = dkim.results
    .filter((r) => r.signingDomain)
    .map((r) => ({
      domain: r.signingDomain!.toLowerCase(),
      selector: r.selector ?? "",
      result: r.status.result,
      aligned: Boolean(r.status.aligned),
      detail: r.status.comment ?? null,
    }))
  const from = dkim.fromFields === 1 && dkim.headerFrom.length === 1 ? dkim.headerFrom[0]! : null
  const signer = signatures.find((s) => s.result === "pass" && s.aligned)?.domain ?? null
  return { from, signatures, signer, alert: await decide(raw, from, signatures) }
}

export async function verifyAlert(raw: string | Buffer, resolver?: DNSResolver): Promise<AlertResult> {
  return (await inspectSignature(raw, resolver)).alert
}

async function decide(raw: string | Buffer, from: string | null, signatures: Signature[]): Promise<AlertResult> {
  if (!from) return { ok: false, reason: "The email must have exactly one From address." }
  const fromDomain = from.split("@").pop()!.toLowerCase()
  const fromBank = bankFor(fromDomain)
  if (!fromBank) return { ok: false, reason: `${fromDomain} is not on the bank allowlist.` }

  const passing = signatures.find((s) => s.result === "pass" && s.aligned && bankFor(s.domain) === fromBank)
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
