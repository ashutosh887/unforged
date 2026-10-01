import { formatPaise } from "./money.js"
import type { Credit, Decision, ScreenshotRead } from "./types.js"

export function normaliseVpa(vpa: string): string {
  return vpa.trim().toLowerCase()
}

export function normaliseUtr(utr: string): string {
  return utr.replace(/\D/g, "")
}

export type Inputs = {
  read: ScreenshotRead
  credit: Credit | null
  shopVpas: string[]
}

export function decideBeforeClaim({ read, credit, shopVpas }: Inputs): Decision | null {
  if (!read.readable || !read.utr || read.amountPaise === null) {
    return { verdict: "UNREADABLE", reason: "The screenshot does not show a readable UTR and amount. Ask for a clearer image; nothing was guessed." }
  }
  if (!credit) {
    return { verdict: "NOT_FOUND_YET", reason: `No bank alert with UTR ${normaliseUtr(read.utr)} has reached this shop. Do not hand over goods yet; alerts can lag a few minutes, so check again.` }
  }
  if (credit.amountPaise !== read.amountPaise) {
    return { verdict: "AMOUNT_MISMATCH", reason: `The screenshot says ${formatPaise(read.amountPaise)} but the bank credited ${formatPaise(credit.amountPaise)} for this UTR.`, credit }
  }
  if (read.payeeVpa && shopVpas.length > 0 && !shopVpas.map(normaliseVpa).includes(normaliseVpa(read.payeeVpa))) {
    return { verdict: "PAYEE_MISMATCH", reason: `The screenshot shows payment to ${read.payeeVpa}, which is not this shop's UPI ID.`, credit }
  }
  return null
}
