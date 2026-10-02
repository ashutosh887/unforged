import { inspectSignature } from "../core/alert.js"
import { claimRecord } from "../core/records.js"
import { body, json, limits, pool, refFrom, text, type Event, type Result } from "./http.js"
import { receiptSigner } from "./signing.js"

export async function handler(event: Event): Promise<Result> {
  const input = body<{ raw?: unknown; claimRef?: unknown; ledger?: unknown }>(event)
  const ledger = input?.ledger === undefined ? "public" : text(input.ledger) ?? ""
  if (!/^(public|[a-z0-9-]{8,40})$/.test(ledger) || ledger.startsWith("shop-")) return json(400, { error: "A ledger id is 8 to 40 lowercase letters, digits or hyphens." })
  const raw = text(input?.raw)
  const claimRef = refFrom(input?.claimRef)
  if (!raw?.trim() || !claimRef) return json(400, { error: "Send the raw email and what it is being claimed for, under 80 characters." })
  if (Buffer.byteLength(raw) > limits.emailBytes) return json(413, { error: "That email is over 2 MB. Paste one without large attachments." })
  const report = await inspectSignature(raw)
  if (report.signer && report.claimBlocked) return json(422, { verdict: "REJECTED", reason: `Signed by ${report.signer}, but it cannot be claimed once: ${report.claimBlocked}`, signatures: report.signatures })
  if (!report.signer || !report.fingerprint) {
    const failing = report.signatures.find((s) => s.result !== "pass")
    const unaligned = report.signatures.find((s) => s.result === "pass" && !s.aligned)
    const reason = unaligned
      ? `Signed by ${unaligned.domain}, which is not the From address's domain, so it proves nothing about the sender.`
      : report.signatures.length
      ? `The signature does not verify${failing?.detail ? ` (${failing.detail})` : ""}. The email was edited or forged; nothing was claimed.`
      : !report.alert.ok && report.alert.reason.startsWith("More than")
        ? report.alert.reason
        : "This email has no DKIM signature, so it cannot be claimed."
    return json(422, { verdict: "REJECTED", reason, signatures: report.signatures })
  }
  let retries = 0
  const decision = await claimRecord(pool(), { ledger, fingerprint: report.fingerprint, signer: report.signer, claimRef }, () => retries++, receiptSigner())
  return json(200, { ...decision, retries })
}
