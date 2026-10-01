import type { Decision, ScreenshotRead } from "../../src/core/types.js"

export type CheckResult = Decision & { read: ScreenshotRead; retries: number }
export type AlertResult = { credit: { bank: string; utr: string; amountPaise: number; creditedAt: string; dkimDomain: string }; duplicate: boolean }
export type RaceResult = {
  n: number
  utr: string
  guarded: { verified: number; alreadyClaimed: number; errors: number; retries: number; ms: number }
  naive: { accepted: number; errors: number }
}

export async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-shop-token": token } : {}) },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) throw new Error(data.error ?? data.message ?? `Request failed (${res.status})`)
  return data
}

const maxBytes = 3_500_000

export async function encodeImage(file: File): Promise<{ image: string; format: string }> {
  const format = file.type.replace("image/", "")
  if (file.size <= maxBytes && ["png", "jpeg", "gif", "webp"].includes(format)) {
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
