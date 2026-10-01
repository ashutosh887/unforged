import { json, pool, shopFor, unauthorised, type Event, type Result } from "./http.js"

type CreditRow = { id: string; bank: string; utr: string; amount_paise: string; credited_at: Date; dkim_domain: string; order_ref: string | null; claimed_at: Date | null }
type AttemptRow = { verdict: string; reason: string; extracted: string; created_at: Date }

export async function handler(event: Event): Promise<Result> {
  const shop = await shopFor(event)
  if (!shop) return unauthorised
  const [named, credits, attempts] = await Promise.all([
    pool().query<{ name: string }>("SELECT name FROM shops WHERE id = $1", [shop.id]),
    pool().query<CreditRow>(
      "SELECT c.id, c.bank, c.utr, c.amount_paise, c.credited_at, c.dkim_domain, k.order_ref, k.created_at AS claimed_at FROM credits c LEFT JOIN claims k ON k.credit_id = c.id WHERE c.shop_id = $1 ORDER BY c.credited_at DESC LIMIT 50",
      [shop.id],
    ),
    pool().query<AttemptRow>("SELECT verdict, reason, extracted, created_at FROM attempts WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 20", [shop.id]),
  ])
  return json(200, {
    shop: { name: named.rows[0]?.name ?? "", vpas: shop.vpas },
    credits: credits.rows.map((r) => ({
      id: r.id,
      bank: r.bank,
      utr: r.utr,
      amountPaise: Number(r.amount_paise),
      creditedAt: new Date(r.credited_at).toISOString(),
      dkimDomain: r.dkim_domain,
      claim: r.order_ref && r.claimed_at ? { orderRef: r.order_ref, createdAt: new Date(r.claimed_at).toISOString() } : null,
    })),
    attempts: attempts.rows.map((r) => ({ verdict: r.verdict, reason: r.reason, alertOnly: r.extracted.includes('"alertOnly":true'), createdAt: new Date(r.created_at).toISOString() })),
  })
}
