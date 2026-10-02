import { verifyAlert } from "../core/alert.js"
import { claim } from "../core/claim.js"
import { body, json, pool, refFrom, sha256, shopFor, unauthorised, type Event, type Result } from "./http.js"
import { receiptSigner } from "./signing.js"

export async function handler(event: Event): Promise<Result> {
  const shop = await shopFor(event)
  if (!shop) return unauthorised
  const input = body<{ raw?: string; orderRef?: string }>(event)
  const raw = input?.raw
  if (!raw) return json(400, { error: "Paste the raw email, headers included." })
  if (input.orderRef?.trim() && !refFrom(input.orderRef)) return json(400, { error: "Keep the order reference under 80 characters." })
  const result = await verifyAlert(raw)
  if (!result.ok) return json(422, { error: result.reason })
  const a = result.alert
  const rawSha256 = sha256(raw)
  const inserted = await pool().query<{ id: string }>(
    "INSERT INTO credits (shop_id, bank, utr, amount_paise, credited_at, source, dkim_domain, raw_sha256) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING id",
    [shop.id, a.bank, a.utr, a.amountPaise, a.creditedAt, a.source, a.dkimDomain, rawSha256],
  )
  const stored = { credit: { ...a, id: inserted.rows[0]?.id ?? null }, duplicate: !inserted.rows[0] }
  const orderRef = refFrom(input.orderRef)
  if (!orderRef) return json(inserted.rows[0] ? 201 : 200, stored)

  const read = { readable: true, utr: a.utr, amountPaise: a.amountPaise, payeeVpa: null, payeeName: null, app: null }
  let retries = 0
  const decision = await claim(pool(), { shopId: shop.id, shopVpas: shop.vpas, read, orderRef, screenshotSha256: rawSha256 }, () => retries++, receiptSigner())
  await pool().query("INSERT INTO attempts (shop_id, screenshot_sha256, extracted, verdict, reason) VALUES ($1, $2, $3, $4, $5)", [shop.id, rawSha256, JSON.stringify({ alertOnly: true, ...read }), decision.verdict, decision.reason])
  return json(200, { ...stored, decision, retries })
}
