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

export async function verifyAlert(raw: string | Buffer, resolver?: DNSResolver): Promise<AlertResult> {
  const dkim = await dkimVerify(raw, resolver ? { resolver } : {})
  if (dkim.fromFields !== 1 || dkim.headerFrom.length !== 1) {
    return { ok: false, reason: "The email must have exactly one From address." }
  }
  const fromDomain = dkim.headerFrom[0]!.split("@").pop()!.toLowerCase()
  const fromBank = bankFor(fromDomain)
  if (!fromBank) return { ok: false, reason: `${fromDomain} is not on the bank allowlist.` }

  const passing = dkim.results.find(
    (r) => r.status.result === "pass" && r.signingDomain && bankFor(r.signingDomain) === fromBank && r.status.aligned,
  )
  if (!passing?.signingDomain) {
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
      dkimDomain: passing.signingDomain.toLowerCase(),
      source: "dkim-email",
    },
  }
}
