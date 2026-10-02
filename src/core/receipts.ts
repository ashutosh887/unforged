import { createHash, randomBytes, verify as verifySignature } from "node:crypto"
import type { Conn, Pool, Sql } from "../db/client.js"
import { withRetry } from "./claim.js"

export const genesis = "0".repeat(64)

export type Signer = { keyId: string; sign(message: Uint8Array): Promise<Uint8Array> }

export type ReceiptKind = "signed-email" | "bank-credit"

export type ReceiptDraft = { kind: ReceiptKind; ledger: string; signer: string; what: string; claimedAt: string; fingerprint: string }

export type ReceiptBody = ReceiptDraft & { id: string; seq: number; prevHash: string; keyId: string }

export type Receipt = ReceiptBody & { hash: string; signature: string }

export type ReceiptLink = { id: string; url: string; seq: number; hash: string; prevHash: string }

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

export function receiptId(): string {
  const bytes = randomBytes(22)
  return Array.from(bytes, (b) => alphabet[b % 62]).join("")
}

export function canonical(body: ReceiptBody): string {
  const ordered = Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return JSON.stringify(ordered)
}

export function chainHash(prevHash: string, text: string): string {
  return createHash("sha256").update(prevHash).update(text).digest("hex")
}

export function bodyOf(receipt: Receipt): ReceiptBody {
  const { hash: _hash, signature: _signature, ...body } = receipt
  return body
}

export function checkReceipt(receipt: Receipt, publicKeyPem: string): { signature: boolean; hash: boolean } {
  const text = canonical(bodyOf(receipt))
  return {
    signature: verifySignature("sha256", Buffer.from(text), publicKeyPem, Buffer.from(receipt.signature, "base64")),
    hash: chainHash(receipt.prevHash, text) === receipt.hash,
  }
}

export function linkOf(receipt: Receipt): ReceiptLink {
  return { id: receipt.id, url: `/#r=${receipt.id}`, seq: receipt.seq, hash: receipt.hash, prevHash: receipt.prevHash }
}

export async function ensureChain(pool: Pool, ledger: string): Promise<void> {
  await withRetry(() => pool.query("INSERT INTO chain_heads (ledger, seq, hash) VALUES ($1, 0, $2) ON CONFLICT DO NOTHING", [ledger, genesis]))
}

export async function appendReceipt(c: Conn, signer: Signer, draft: ReceiptDraft): Promise<Receipt> {
  const { rows } = await c.query<{ seq: string; hash: string }>("SELECT seq, hash FROM chain_heads WHERE ledger = $1 FOR UPDATE", [draft.ledger])
  const head = rows[0] ?? { seq: "0", hash: genesis }
  const body: ReceiptBody = { ...draft, id: receiptId(), seq: Number(head.seq) + 1, prevHash: head.hash, keyId: signer.keyId }
  const text = canonical(body)
  const hash = chainHash(body.prevHash, text)
  const signature = Buffer.from(await signer.sign(Buffer.from(text))).toString("base64")
  await c.query(
    "INSERT INTO receipts (id, ledger, seq, kind, signer, what, claimed_at, fingerprint, prev_hash, hash, key_id, signature) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    [body.id, body.ledger, body.seq, body.kind, body.signer, body.what, body.claimedAt, body.fingerprint, body.prevHash, hash, body.keyId, signature],
  )
  await c.query("UPDATE chain_heads SET seq = $2, hash = $3 WHERE ledger = $1", [draft.ledger, body.seq, hash])
  return { ...body, hash, signature }
}

type ReceiptRow = { id: string; ledger: string; seq: string; kind: ReceiptKind; signer: string; what: string; claimed_at: string; fingerprint: string; prev_hash: string; hash: string; key_id: string; signature: string }

const columns = "id, ledger, seq, kind, signer, what, claimed_at, fingerprint, prev_hash, hash, key_id, signature"

function fromRow(r: ReceiptRow): Receipt {
  return { id: r.id, ledger: r.ledger, seq: Number(r.seq), kind: r.kind, signer: r.signer, what: r.what, claimedAt: r.claimed_at, fingerprint: r.fingerprint, prevHash: r.prev_hash, keyId: r.key_id, hash: r.hash, signature: r.signature }
}

export async function findReceipt(sql: Sql, id: string): Promise<Receipt | null> {
  const { rows } = await sql.query<ReceiptRow>(`SELECT ${columns} FROM receipts WHERE id = $1`, [id])
  return rows[0] ? fromRow(rows[0]) : null
}

export async function chainOf(sql: Sql, ledger: string, limit: number): Promise<Receipt[]> {
  const { rows } = await sql.query<ReceiptRow>(`SELECT ${columns} FROM receipts WHERE ledger = $1 ORDER BY seq LIMIT $2`, [ledger, limit])
  return rows.map(fromRow)
}
