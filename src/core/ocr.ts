import { DetectDocumentTextCommand, type TextractClient } from "@aws-sdk/client-textract"
import type { ImageFormat } from "@aws-sdk/client-bedrock-runtime"
import { toRead } from "./read.js"
import type { ScreenshotRead } from "./types.js"

export type Box = { left: number; top: number; width: number; height: number }
export type Line = { text: string; height: number; box?: Box }
export type FieldBox = Box & { field: "utr" | "amount" | "payee"; text: string }

const utrLabel = /\b(UPI\s*(transaction|txn|ref(erence)?)\s*(id|no\.?|number)?|UTR|RRN)\b/i
const twelveDigits = /(?<!\d)(\d{4}\s?\d{4}\s?\d{4})(?!\d)/g
const currencyAmount = /^(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)$/i
const bareAmount = /^([\d,]+(?:\.\d{1,2})?)$/
const vpaPattern = /[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{1,}/gi
const apps: [RegExp, string][] = [
  [/google\s*pay|\bgpay\b/i, "gpay"],
  [/phonepe/i, "phonepe"],
  [/paytm/i, "paytm"],
  [/\bbhim\b/i, "bhim"],
]

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function digitsIn(text: string): string[] {
  return [...text.matchAll(twelveDigits)].map((m) => m[1]!.replace(/\s/g, ""))
}

function findUtr(lines: Line[]): string | null {
  const labelled = lines.flatMap((line, i) => (utrLabel.test(line.text) ? [...digitsIn(line.text), ...digitsIn(lines[i + 1]?.text ?? "")] : []))
  const fromLabels = distinct(labelled)
  if (fromLabels.length === 1) return fromLabels[0]!
  if (fromLabels.length > 1) return null
  const anywhere = distinct(lines.flatMap((l) => digitsIn(l.text)))
  return anywhere.length === 1 ? anywhere[0]! : null
}

function findAmount(lines: Line[]): string | null {
  const withCurrency = distinct(lines.flatMap((l) => l.text.replace(/\s+/g, " ").trim().match(currencyAmount)?.[1] ?? []))
  if (withCurrency.length === 1) return withCurrency[0]!
  if (withCurrency.length > 1) return null
  const heights = lines.map((l) => l.height).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)] ?? 0
  const big = lines.filter((l) => bareAmount.test(l.text.trim()) && l.height >= median * 1.8)
  const values = distinct(big.map((l) => l.text.trim()))
  return values.length === 1 ? values[0]! : null
}

function findPayee(lines: Line[]): string | null {
  const to = lines.findIndex((l) => /^to\b/i.test(l.text.trim()))
  if (to >= 0) {
    const from = lines.findIndex((l, i) => i > to && /^from\b/i.test(l.text.trim()))
    const section = lines.slice(to, from > to ? from : to + 3)
    const vpas = distinct(section.flatMap((l) => l.text.match(vpaPattern) ?? []).map((v) => v.toLowerCase()))
    if (vpas.length === 1) return vpas[0]!
  }
  const all = distinct(lines.flatMap((l) => l.text.match(vpaPattern) ?? []).map((v) => v.toLowerCase()))
  return all.length === 1 ? all[0]! : null
}

export function readLines(lines: Line[]): ScreenshotRead {
  const text = lines.map((l) => l.text).join("\n")
  const utr = findUtr(lines)
  const amount = findAmount(lines)
  const toLine = lines.find((l) => /^to\b[:\s]/i.test(l.text.trim()))
  return toRead({
    readable: utr !== null && amount !== null,
    utr,
    amount,
    payeeVpa: findPayee(lines),
    payeeName: toLine ? toLine.text.trim().replace(/^to\b[:\s]*/i, "") || null : null,
    app: apps.find(([pattern]) => pattern.test(text))?.[1] ?? null,
  })
}

export function imageFormat(image: Uint8Array): ImageFormat | null {
  const b = Buffer.from(image)
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg"
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return "gif"
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  return null
}

export function fieldBoxes(lines: Line[], read: ScreenshotRead): FieldBox[] {
  const digits = (t: string) => t.replace(/\D/g, "")
  const amountText = read.amountPaise === null ? null : String(read.amountPaise / 100)
  const pick = (field: FieldBox["field"], match: (l: Line) => boolean): FieldBox[] => {
    const line = lines.find((l) => l.box && match(l))
    return line?.box ? [{ field, text: line.text, ...line.box }] : []
  }
  return [
    ...(read.utr ? pick("utr", (l) => digits(l.text).includes(read.utr!)) : []),
    ...(amountText ? pick("amount", (l) => digits(l.text.split(".")[0]!) === amountText.split(".")[0] && /^(?:₹|Rs\.?|INR)?\s*[\d,]+(?:\.\d{1,2})?$/i.test(l.text.trim())) : []),
    ...(read.payeeVpa ? pick("payee", (l) => l.text.toLowerCase().includes(read.payeeVpa!.toLowerCase())) : []),
  ]
}

export async function textractLines(client: TextractClient, image: Uint8Array): Promise<Line[]> {
  const out = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: image } }))
  return (out.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => {
      const g = b.Geometry?.BoundingBox
      return { text: b.Text!, height: g?.Height ?? 0, ...(g ? { box: { left: g.Left ?? 0, top: g.Top ?? 0, width: g.Width ?? 0, height: g.Height ?? 0 } } : {}) }
    })
}

export async function readWithTextract(client: TextractClient, image: Uint8Array): Promise<ScreenshotRead> {
  return readLines(await textractLines(client, image))
}
