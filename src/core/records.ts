import type { Pool } from "../db/client.js"
import { inTx, isUniqueViolation, withRetry } from "./claim.js"
import { istTime } from "./money.js"
import { appendReceipt, ensureChain, linkOf, type ReceiptLink, type Signer } from "./receipts.js"

export type RecordClaimInput = { ledger: string; fingerprint: string; signer: string; claimRef: string }

export type RecordDecision =
  | { verdict: "VERIFIED"; reason: string; ledger: string; signer: string; claimRef: string; claimedAt: string; receipt?: ReceiptLink }
  | { verdict: "ALREADY_CLAIMED"; reason: string; ledger: string; signer: string; priorClaim: { claimRef: string; createdAt: string } }

export async function claimRecord(pool: Pool, input: RecordClaimInput, onRetry?: () => void, signer?: Signer): Promise<RecordDecision> {
  try {
    if (signer) await ensureChain(pool, input.ledger)
    const { createdAt, receipt } = await withRetry(
      () =>
        inTx(pool, async (c) => {
          const { rows } = await c.query<{ created_at: Date }>("INSERT INTO ledger_claims (ledger, fingerprint, signer, claim_ref) VALUES ($1, $2, $3, $4) RETURNING created_at", [input.ledger, input.fingerprint, input.signer, input.claimRef])
          const at = new Date(rows[0]!.created_at).toISOString()
          const made = signer ? await appendReceipt(c, signer, { kind: "signed-email", ledger: input.ledger, signer: input.signer, what: input.claimRef, claimedAt: at, fingerprint: input.fingerprint }) : null
          return { createdAt: at, receipt: made ? linkOf(made) : null }
        }),
      8,
      onRetry,
    )
    return { verdict: "VERIFIED", reason: `Signed by ${input.signer}. Claimed once, for "${input.claimRef}".`, ledger: input.ledger, signer: input.signer, claimRef: input.claimRef, claimedAt: createdAt, ...(receipt ? { receipt } : {}) }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const { rows } = await pool.query<{ claim_ref: string; created_at: Date }>("SELECT claim_ref, created_at FROM ledger_claims WHERE ledger = $1 AND fingerprint = $2", [input.ledger, input.fingerprint])
    const prior = rows[0] ? { claimRef: rows[0].claim_ref, createdAt: new Date(rows[0].created_at).toISOString() } : { claimRef: "another claim", createdAt: "" }
    return { verdict: "ALREADY_CLAIMED", reason: `This signed email was already claimed for "${prior.claimRef}"${prior.createdAt ? ` at ${istTime(prior.createdAt)}` : ""}. The email is genuine, but it has been used before.`, ledger: input.ledger, signer: input.signer, priorClaim: prior }
  }
}
