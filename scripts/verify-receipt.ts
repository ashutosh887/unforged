import { checkReceipt, type Receipt } from "../src/core/receipts.js"
import { meta, post, requireEnv, writeResult } from "./lib.js"

const id = requireEnv("RECEIPT_ID")
const found = await post<{ receipt?: Receipt; verified?: boolean }>("/api/receipts", { id })
const key = await post<{ publicKeyPem?: string }>("/api/receipts/key", { keyId: found.body.receipt?.keyId })
if (!key.body.publicKeyPem || !found.body.receipt) {
  console.error(`could not fetch the receipt or the key: HTTP ${found.status} / ${key.status}`)
  process.exit(1)
}
const local = checkReceipt(found.body.receipt, key.body.publicKeyPem)
const tampered = checkReceipt({ ...found.body.receipt, what: `${found.body.receipt.what} (edited)` }, key.body.publicKeyPem)
const out = { ...meta(), id, server: found.body.verified, local, tamperedCopy: tampered, receipt: found.body.receipt, publicKeyPem: key.body.publicKeyPem }
const file = await writeResult("verify-receipt", out)
console.log(`Receipt ${id}`)
console.log(`  server says verified: ${found.body.verified}`)
console.log(`  checked here with node:crypto: signature ${local.signature}, hash ${local.hash}`)
console.log(`  the same receipt with one field edited: signature ${tampered.signature}, hash ${tampered.hash}`)
console.log(`Raw: ${file}`)
