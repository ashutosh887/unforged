import type { Conn, Pool } from "../db/client.js"
import { formatPaise, istTime } from "./money.js"
import { appendReceipt, ensureChain, linkOf, type ReceiptLink, type Signer } from "./receipts.js"
import { decideBeforeClaim, normaliseUtr } from "./verdict.js"
import type { Credit, Decision, ScreenshotRead } from "./types.js"

type CreditRow = { id: string; bank: string; utr: string; amount_paise: string; credited_at: Date; source: Credit["source"]; dkim_domain: string }

const conflictCodes = new Set(["40001", "OC000", "OC001"])
const uniqueViolation = "23505"

export function isUniqueViolation(e: unknown): boolean {
  return errorCode(e) === uniqueViolation
}

function errorCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined
}

export function isConflict(e: unknown): boolean {
  const code = errorCode(e)
  return code !== undefined && conflictCodes.has(code)
}

export async function withRetry<T>(run: () => Promise<T>, attempts = 8, onRetry?: () => void): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run()
    } catch (e) {
      if (!isConflict(e) || i >= attempts) throw e
      onRetry?.()
      await new Promise((r) => setTimeout(r, Math.random() * 10 * 2 ** i))
    }
  }
}

function toCredit(row: CreditRow): Credit {
  return { id: row.id, bank: row.bank, utr: row.utr, amountPaise: Number(row.amount_paise), creditedAt: new Date(row.credited_at).toISOString(), dkimDomain: row.dkim_domain, source: row.source }
}

export async function inTx<T>(pool: Pool, body: (c: Conn) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query("BEGIN")
    const out = await body(c)
    await c.query("COMMIT")
    return out
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
}

export type ClaimInput = { shopId: string; shopVpas: string[]; read: ScreenshotRead; orderRef: string; screenshotSha256: string }

async function findCredit(sql: Pool | Conn, shopId: string, utr: string): Promise<Credit | null> {
  const { rows } = await sql.query<CreditRow>(
    "SELECT id, bank, utr, amount_paise, credited_at, source, dkim_domain FROM credits WHERE shop_id = $1 AND utr = $2 ORDER BY credited_at LIMIT 1",
    [shopId, utr],
  )
  return rows[0] ? toCredit(rows[0]) : null
}

async function priorClaim(pool: Pool, creditId: string) {
  const { rows } = await pool.query<{ order_ref: string; created_at: Date }>("SELECT order_ref, created_at FROM claims WHERE credit_id = $1", [creditId])
  return rows[0] ? { orderRef: rows[0].order_ref, createdAt: new Date(rows[0].created_at).toISOString() } : undefined
}

export async function claim(pool: Pool, input: ClaimInput, onRetry?: () => void, signer?: Signer): Promise<Decision> {
  const utr = input.read.utr ? normaliseUtr(input.read.utr) : null
  const credit = utr ? await findCredit(pool, input.shopId, utr) : null
  const early = decideBeforeClaim({ read: input.read, credit, shopVpas: input.shopVpas })
  if (early) return early
  const found = credit!

  const ledger = `shop-${input.shopId}`
  let receipt: ReceiptLink | null = null
  try {
    if (signer) await ensureChain(pool, ledger)
    receipt = await withRetry(
      () =>
        inTx(pool, async (c) => {
          const { rows } = await c.query<{ created_at: Date }>("INSERT INTO claims (shop_id, credit_id, order_ref, screenshot_sha256) VALUES ($1, $2, $3, $4) RETURNING created_at", [input.shopId, found.id, input.orderRef, input.screenshotSha256])
          if (!signer) return null
          const what = `UTR ${found.utr}, ${formatPaise(found.amountPaise)}, order ${input.orderRef}`
          const made = await appendReceipt(c, signer, { kind: "bank-credit", ledger, signer: found.dkimDomain, what, claimedAt: new Date(rows[0]!.created_at).toISOString(), fingerprint: found.id })
          return linkOf(made)
        }),
      8,
      onRetry,
    )
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const prior = await priorClaim(pool, found.id)
    return { verdict: "ALREADY_CLAIMED", reason: `This bank credit was already used for order ${prior?.orderRef ?? "another order"}${prior ? ` at ${istTime(prior.createdAt)}` : ""}. The screenshot may be real, but it has been shown before.`, credit: found, ...(prior ? { priorClaim: prior } : {}) }
  }
  return { verdict: "VERIFIED", reason: `${found.bank.toUpperCase()} credited this amount at ${istTime(found.creditedAt)}, signed by ${found.dkimDomain}. Claimed for order ${input.orderRef}.`, credit: found, ...(receipt ? { receipt } : {}) }
}

export async function claimNaive(pool: Pool, creditId: string, orderRef: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM claims_naive WHERE credit_id = $1", [creditId])
  if (rows.length > 0) return false
  await pool.query("INSERT INTO claims_naive (credit_id, order_ref) VALUES ($1, $2)", [creditId, orderRef])
  return true
}
