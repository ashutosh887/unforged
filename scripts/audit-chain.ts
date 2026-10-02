import { checkReceipt, genesis, type Receipt } from "../src/core/receipts.js"
import { meta, post, requireEnv, writeResult } from "./lib.js"

const ledger = requireEnv("LEDGER")
const chain = await post<{ receipts?: Receipt[] }>("/api/receipts/chain", { ledger, limit: 50 })
if (!chain.body.receipts) {
  console.error(`could not fetch the chain: HTTP ${chain.status}`)
  process.exit(1)
}
const pems = new Map<string, string>()
for (const keyId of new Set(chain.body.receipts.map((r) => r.keyId))) {
  const key = await post<{ publicKeyPem?: string }>("/api/receipts/key", { keyId })
  if (!key.body.publicKeyPem) {
    console.error(`could not fetch key ${keyId}: HTTP ${key.status}`)
    process.exit(1)
  }
  pems.set(keyId, key.body.publicKeyPem)
}
const rows = chain.body.receipts.map((r, i, all) => {
  const check = checkReceipt(r, pems.get(r.keyId)!)
  const expectedPrev = i === 0 ? genesis : all[i - 1]!.hash
  return { seq: r.seq, id: r.id, signature: check.signature, hash: check.hash, linked: r.prevHash === expectedPrev, inOrder: r.seq === i + 1 }
})
const breaks = rows.filter((r) => !r.signature || !r.hash || !r.linked || !r.inOrder)
const file = await writeResult("audit-chain", { ...meta(), ledger, entries: rows.length, keys: [...pems.keys()], breaks, rows })
console.log(`Ledger ${ledger}: ${rows.length} receipts, ${breaks.length} breaks`)
for (const b of breaks) console.log(`  break at seq ${b.seq} (${b.id}): signature ${b.signature}, hash ${b.hash}, linked ${b.linked}, in order ${b.inOrder}`)
console.log(`Raw: ${file}`)
