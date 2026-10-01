import { randomInt, randomUUID } from "node:crypto"
import { claim, claimNaive } from "../core/claim.js"
import type { ScreenshotRead } from "../core/types.js"
import { body, json, pool, type Event, type Result } from "./http.js"

const raceShop = "00000000-0000-0000-0000-000000000000"
const raceVpa = "race@unforged"

export async function handler(event: Event): Promise<Result> {
  const n = Math.min(Math.max(Math.trunc(body<{ n?: number }>(event)?.n ?? 50), 2), 100)
  const utr = String(randomInt(100_000_000_000, 999_999_999_999))
  const amountPaise = 50_000
  await pool().query(
    "INSERT INTO credits (shop_id, bank, utr, amount_paise, credited_at, source, dkim_domain, raw_sha256) VALUES ($1, 'race', $2, $3, now(), 'race', 'race', $4)",
    [raceShop, utr, amountPaise, randomUUID()],
  )
  const read: ScreenshotRead = { readable: true, utr, amountPaise, payeeVpa: raceVpa, payeeName: null, app: null }
  let retries = 0
  const started = Date.now()
  const decisions = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => claim(pool(), { shopId: raceShop, shopVpas: [raceVpa], read, orderRef: `race-${i}`, screenshotSha256: utr }, () => retries++)),
  )
  const guardedMs = Date.now() - started
  const naiveCredit = randomUUID()
  const naive = await Promise.allSettled(Array.from({ length: n }, (_, i) => claimNaive(pool(), naiveCredit, `naive-${i}`)))

  const count = (v: string) => decisions.filter((d) => d.status === "fulfilled" && d.value.verdict === v).length
  return json(200, {
    n,
    utr,
    guarded: { verified: count("VERIFIED"), alreadyClaimed: count("ALREADY_CLAIMED"), errors: decisions.filter((d) => d.status === "rejected").length, retries, ms: guardedMs },
    naive: { accepted: naive.filter((d) => d.status === "fulfilled" && d.value).length, errors: naive.filter((d) => d.status === "rejected").length },
  })
}
