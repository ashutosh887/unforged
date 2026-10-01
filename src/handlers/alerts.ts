import { verifyAlert } from "../core/alert.js"
import { body, json, pool, sha256, shopFor, unauthorised, type Event, type Result } from "./http.js"

export async function handler(event: Event): Promise<Result> {
  const shop = await shopFor(event)
  if (!shop) return unauthorised
  const raw = body<{ raw?: string }>(event)?.raw
  if (!raw) return json(400, { error: "Paste the raw email, headers included." })
  const result = await verifyAlert(raw)
  if (!result.ok) return json(422, { error: result.reason })
  const a = result.alert
  const inserted = await pool().query<{ id: string }>(
    "INSERT INTO credits (shop_id, bank, utr, amount_paise, credited_at, source, dkim_domain, raw_sha256) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING id",
    [shop.id, a.bank, a.utr, a.amountPaise, a.creditedAt, a.source, a.dkimDomain, sha256(raw)],
  )
  return json(inserted.rows[0] ? 201 : 200, { credit: { ...a, id: inserted.rows[0]?.id ?? null }, duplicate: !inserted.rows[0] })
}
