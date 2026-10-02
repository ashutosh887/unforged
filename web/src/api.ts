import type { Decision, ScreenshotRead } from "../../src/core/types.js"

export type CheckResult = Decision & { read: ScreenshotRead; reader?: string; retries: number }
export type AlertResult = { credit: { bank: string; utr: string; amountPaise: number; creditedAt: string; dkimDomain: string }; duplicate: boolean; decision?: Decision }
export type VerifyResult = {
  from: string | null
  signatures: { domain: string; selector: string; result: string; aligned: boolean; detail: string | null }[]
  signer: string | null
  bankCredit: { bank: string; utr: string; amountPaise: number; dkimDomain: string } | null
  notStoredBecause: string | null
}
export type LedgerResult = {
  shop: { name: string; vpas: string[] }
  credits: { id: string; bank: string; utr: string; amountPaise: number; creditedAt: string; dkimDomain: string; claim: { orderRef: string; createdAt: string } | null }[]
  attempts: { verdict: string; reason: string; alertOnly: boolean; createdAt: string }[]
}
export type RecordClaimResult =
  | { verdict: "VERIFIED"; reason: string; signer: string; claimRef: string; claimedAt: string; receipt?: ReceiptLink }
  | { verdict: "ALREADY_CLAIMED"; reason: string; signer: string; priorClaim: { claimRef: string; createdAt: string } }
  | { verdict: "REJECTED"; reason: string }
export type FieldBox = { field: "utr" | "amount" | "payee"; text: string; left: number; top: number; width: number; height: number }
export type ReadResult = { read: ScreenshotRead; reader: string; boxes: FieldBox[]; ms: number }
export type ReceiptLink = { id: string; url: string; seq: number; hash: string; prevHash: string }
export type Receipt = { id: string; kind: "signed-email" | "bank-credit"; ledger: string; seq: number; signer: string; what: string; claimedAt: string; fingerprint: string; prevHash: string; keyId: string; hash: string; signature: string }
export type ReceiptResult = { receipt: Receipt; verified: boolean; check: { signature: boolean; hash: boolean } }
export type RaceResult = {
  n: number
  utr: string
  guarded: { verified: number; alreadyClaimed: number; errors: number; retries: number; ms: number }
  naive: { accepted: number; errors: number }
}

export type ChainResult = { ledger: string; receipts: Receipt[]; checks: { id: string; signature: boolean; hash: boolean }[] }

export async function call(path: string, body: unknown, init: { token?: string; signal?: AbortSignal } = {}): Promise<Response> {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.token ? { "x-shop-token": init.token } : {}) },
    body: JSON.stringify(body),
    ...(init.signal ? { signal: init.signal } : {}),
  })
  return res
}

export async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await call(path, body, token ? { token } : {})
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) throw new Error(data.error ?? data.message ?? `The server answered ${res.status}. Try again.`)
  return data
}

const maxBytes = 3_500_000

export async function encodeImage(file: File, formats: string[] = ["png", "jpeg", "gif", "webp"]): Promise<{ image: string; format: string }> {
  const format = file.type.replace("image/", "")
  if (file.size <= maxBytes && formats.includes(format)) {
    return { image: await toBase64(file), format }
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", 0.9))
  return { image: await toBase64(blob), format: "jpeg" }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
