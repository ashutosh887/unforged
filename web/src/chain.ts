import { post, type Receipt } from "./api"
import { canonical, chainHash } from "./features/ChainView"

export type BrowserCheck = { id: string; hash: boolean; signature: boolean }

const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

function bytes(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64)
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let at = der[1]! & 0x80 ? 2 + (der[1]! & 0x7f) : 2
  const part = () => {
    const length = der[at + 1]!
    const value = der.slice(at + 2, at + 2 + length)
    at += 2 + length
    const trimmed = value.length > 32 ? value.slice(value.length - 32) : value
    const padded = new Uint8Array(32)
    padded.set(trimmed, 32 - trimmed.length)
    return padded
  }
  const raw = new Uint8Array(64)
  raw.set(part(), 0)
  raw.set(part(), 32)
  return raw
}

export function keyPem(keyId: string): Promise<string> {
  return post<{ publicKeyPem: string }>("receipts/key", { keyId }).then((k) => k.publicKeyPem)
}

function keyFor(keyId: string): Promise<CryptoKey> {
  let key = keys.get(keyId)
  if (!key) {
    key = keyPem(keyId).then((pem) => crypto.subtle.importKey("spki", bytes(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]))
    key.catch(() => keys.delete(keyId))
    keys.set(keyId, key)
  }
  return key
}

export async function checkInBrowser(receipt: Receipt): Promise<BrowserCheck> {
  const text = canonical(receipt)
  const [hash, signature] = await Promise.all([
    chainHash(receipt.prevHash, text),
    keyFor(receipt.keyId).then((key) => crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(bytes(receipt.signature)), encoder.encode(text))),
  ])
  return { id: receipt.id, hash: hash === receipt.hash, signature }
}
