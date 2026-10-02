import { TextractClient } from "@aws-sdk/client-textract"
import { fieldBoxes, imageFormat, readLines, textractLines } from "../core/ocr.js"
import { body, json, limits, text, type Event, type Result } from "./http.js"

const textract = new TextractClient({})

export async function handler(event: Event): Promise<Result> {
  const image64 = text(body<{ image?: unknown }>(event)?.image)
  if (!image64) return json(400, { error: "Send a screenshot as base64." })
  if (image64.length > Math.ceil((limits.imageBytes * 4) / 3) + 4) return json(413, { error: "That screenshot is over 4 MB. Send a smaller one." })
  const image = Buffer.from(image64, "base64")
  const format = imageFormat(image)
  if (format !== "png" && format !== "jpeg") return json(400, { error: "Send a PNG or JPEG screenshot." })
  const started = performance.now()
  try {
    const lines = await textractLines(textract, image)
    const read = readLines(lines)
    return json(200, { read, reader: "textract", boxes: fieldBoxes(lines, read), ms: Math.round(performance.now() - started) })
  } catch (e) {
    console.error(JSON.stringify({ event: "read_failed", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }))
    return json(503, { error: "The screenshot reader is unavailable right now. Try again shortly." })
  }
}
