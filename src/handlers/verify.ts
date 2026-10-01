import { inspectSignature } from "../core/alert.js"
import { body, json, type Event, type Result } from "./http.js"

const maxBytes = 2_000_000

export async function handler(event: Event): Promise<Result> {
  const raw = body<{ raw?: string }>(event)?.raw
  if (!raw?.trim()) return json(400, { error: "Paste the raw email, headers included." })
  if (Buffer.byteLength(raw) > maxBytes) return json(413, { error: "That email is over 2 MB. Paste one without large attachments." })
  const report = await inspectSignature(raw)
  return json(200, {
    from: report.from,
    signatures: report.signatures,
    signer: report.signer,
    bankCredit: report.alert.ok ? report.alert.alert : null,
    notStoredBecause: report.alert.ok ? null : report.alert.reason,
  })
}
