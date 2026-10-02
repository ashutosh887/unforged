import { BedrockRuntimeClient, type ImageFormat } from "@aws-sdk/client-bedrock-runtime"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { TextractClient } from "@aws-sdk/client-textract"
import { claim } from "../core/claim.js"
import { readWithTextract } from "../core/ocr.js"
import { readScreenshot } from "../core/read.js"
import { body, env, json, limits, pool, refFrom, sha256, shopFor, unauthorised, type Event, type Result } from "./http.js"

const bedrock = new BedrockRuntimeClient({ maxAttempts: 2 })
const s3 = new S3Client({})
const textract = new TextractClient({})
function sniff(image: Buffer): ImageFormat | null {
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return "jpeg"
  if (image.subarray(0, 4).toString("latin1") === "GIF8") return "gif"
  if (image.subarray(0, 4).toString("latin1") === "RIFF" && image.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  return null
}

function readWith(model: string, image: Uint8Array, format: ImageFormat) {
  return model === "textract" ? readWithTextract(textract, image) : readScreenshot(bedrock, model, image, format)
}

const benchedUntil = new Map<string, number>()
const benchMs = 15 * 60 * 1000

function outOfDailyQuota(e: unknown): boolean {
  return e instanceof Error && e.name === "ThrottlingException" && /per day/i.test(e.message)
}

async function readWithFallback(models: string[], image: Uint8Array, format: ImageFormat) {
  const ready = models.filter((m) => (benchedUntil.get(m) ?? 0) <= Date.now())
  for (const model of ready.length ? ready : models) {
    try {
      return { read: await readWith(model, image, format), reader: model }
    } catch (e) {
      if (outOfDailyQuota(e)) benchedUntil.set(model, Date.now() + benchMs)
      console.error(JSON.stringify({ event: "reader_failed", model, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }))
    }
  }
  return null
}

type Input = { image?: string; orderRef?: string }

export async function handler(event: Event): Promise<Result> {
  const shop = await shopFor(event)
  if (!shop) return unauthorised
  const input = body<Input>(event)
  const orderRef = refFrom(input?.orderRef)
  if (!input?.image || !orderRef) return json(400, { error: "Send a screenshot and an order reference under 80 characters." })
  if (input.image.length > Math.ceil((limits.imageBytes * 4) / 3) + 4) return json(413, { error: "That screenshot is over 4 MB. Send a smaller one." })
  const image = Buffer.from(input.image, "base64")
  const format = sniff(image)
  if (!format) return json(400, { error: "That file is not a PNG, JPEG, GIF or WebP image." })
  const screenshotSha256 = sha256(image)
  await s3.send(new PutObjectCommand({ Bucket: env("UPLOAD_BUCKET"), Key: `${shop.id}/${screenshotSha256}.${format}`, Body: image, ContentType: `image/${format}` }))

  const models = env("MODEL_ID").split(",").map((m) => m.trim()).filter(Boolean)
  const found = await readWithFallback(models, image, format)
  if (!found) return json(503, { error: "The screenshot reader is unavailable right now. Nothing was claimed; try again shortly." })
  const { read, reader } = found
  let retries = 0
  const decision = await claim(pool(), { shopId: shop.id, shopVpas: shop.vpas, read, orderRef, screenshotSha256 }, () => retries++)
  await pool().query("INSERT INTO attempts (shop_id, screenshot_sha256, extracted, verdict, reason) VALUES ($1, $2, $3, $4, $5)", [shop.id, screenshotSha256, JSON.stringify({ ...read, reader }), decision.verdict, decision.reason])
  return json(200, { ...decision, read, reader, retries })
}
