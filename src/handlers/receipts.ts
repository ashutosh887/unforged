import { chainOf, checkReceipt, findReceipt, signedWith } from "../core/receipts.js"
import { body, bounded, env, json, pool, shopFor, text, unauthorised, type Event, type Result } from "./http.js"
import { publicKeyPem } from "./signing.js"

const idPattern = /^[0-9A-Za-z]{22}$/
const ledgerPattern = /^[a-z0-9-]{1,60}$/
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function handler(event: Event): Promise<Result> {
  const path = event.rawPath ?? ""
  const input = body<{ id?: unknown; ledger?: unknown; limit?: unknown; keyId?: unknown }>(event)

  if (path.endsWith("/key")) {
    const keyId = input?.keyId === undefined ? env("RECEIPT_KEY_ID") : text(input.keyId) ?? ""
    if (!keyPattern.test(keyId)) return json(400, { error: "A key id is a KMS key UUID." })
    if (keyId !== env("RECEIPT_KEY_ID") && !(await signedWith(pool(), keyId))) return json(404, { error: "No receipt key with that id." })
    return json(200, { keyId, algorithm: "ECDSA_SHA_256", curve: "P-256", publicKeyPem: await publicKeyPem(keyId) })
  }

  if (path.endsWith("/chain")) {
    const ledger = text(input?.ledger) ?? ""
    if (!ledgerPattern.test(ledger)) return json(400, { error: "Send a ledger id." })
    if (ledger.startsWith("shop-")) {
      const shop = await shopFor(event)
      if (!shop) return unauthorised
      if (ledger !== `shop-${shop.id}`) return json(404, { error: "No ledger with that id for this shop." })
    }
    const limit = bounded(input?.limit, 50, 1, 50)
    const receipts = await chainOf(pool(), ledger, limit)
    const checks = await Promise.all(receipts.map(async (r) => ({ id: r.id, ...checkReceipt(r, await publicKeyPem(r.keyId)) })))
    return json(200, { ledger, receipts, checks })
  }

  const id = text(input?.id) ?? ""
  if (!idPattern.test(id)) return json(400, { error: "A receipt id is 22 letters and digits." })
  const receipt = await findReceipt(pool(), id)
  if (!receipt) return json(404, { error: "No receipt with that id." })
  const check = checkReceipt(receipt, await publicKeyPem(receipt.keyId))
  return json(200, { receipt, verified: check.signature && check.hash, check })
}
