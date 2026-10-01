export type Verdict =
  | "VERIFIED"
  | "UNREADABLE"
  | "NOT_FOUND_YET"
  | "AMOUNT_MISMATCH"
  | "PAYEE_MISMATCH"
  | "ALREADY_CLAIMED"

export type ScreenshotRead = {
  readable: boolean
  utr: string | null
  amountPaise: number | null
  payeeVpa: string | null
  payeeName: string | null
  app: string | null
}

export type Credit = {
  id: string
  bank: string
  utr: string
  amountPaise: number
  creditedAt: string
  dkimDomain: string
  source: "dkim-email" | "ses" | "sms-unsigned"
}

export type PriorClaim = {
  orderRef: string
  createdAt: string
}

export type Decision = {
  verdict: Verdict
  reason: string
  credit?: Credit
  priorClaim?: PriorClaim
}
