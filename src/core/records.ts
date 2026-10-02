import type { Pool } from "../db/client.js"
import { inTx, isUniqueViolation, withRetry } from "./claim.js"
import { istTime } from "./money.js"

export type RecordClaimInput = { fingerprint: string; signer: string; claimRef: string }

export type RecordDecision =
  | { verdict: "VERIFIED"; reason: string; signer: string; claimRef: string; claimedAt: string }
  | { verdict: "ALREADY_CLAIMED"; reason: string; signer: string; priorClaim: { claimRef: string; createdAt: string } }

export async function claimRecord(pool: Pool, input: RecordClaimInput, onRetry?: () => void): Promise<RecordDecision> {
  try {
    const createdAt = await withRetry(
      () =>
        inTx(pool, async (c) => {
          const { rows } = await c.query<{ created_at: Date }>("INSERT INTO claimed_records (fingerprint, signer, claim_ref) VALUES ($1, $2, $3) RETURNING created_at", [input.fingerprint, input.signer, input.claimRef])
          return new Date(rows[0]!.created_at).toISOString()
        }),
      8,
      onRetry,
    )
    return { verdict: "VERIFIED", reason: `Signed by ${input.signer}. Claimed once, for "${input.claimRef}".`, signer: input.signer, claimRef: input.claimRef, claimedAt: createdAt }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const { rows } = await pool.query<{ claim_ref: string; created_at: Date }>("SELECT claim_ref, created_at FROM claimed_records WHERE fingerprint = $1", [input.fingerprint])
    const prior = rows[0] ? { claimRef: rows[0].claim_ref, createdAt: new Date(rows[0].created_at).toISOString() } : { claimRef: "another claim", createdAt: "" }
    return { verdict: "ALREADY_CLAIMED", reason: `This signed email was already claimed for "${prior.claimRef}"${prior.createdAt ? ` at ${istTime(prior.createdAt)}` : ""}. The email is genuine, but it has been used before.`, signer: input.signer, priorClaim: prior }
  }
}
