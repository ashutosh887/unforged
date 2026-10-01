import { BedrockRuntimeClient, type ImageFormat } from "@aws-sdk/client-bedrock-runtime"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { claim } from "../core/claim.js"
import { readScreenshot } from "../core/read.js"
import { body, env, json, pool, sha256, shopFor, unauthorised, type Event, type Result } from "./http.js"

const bedrock = new BedrockRuntimeClient({})
const s3 = new S3Client({})
const formats = new Set<ImageFormat>(["png", "jpeg", "gif", "webp"])

type Input = { image?: string; format?: string; orderRef?: string }

export async function handler(event: Event): Promise<Result> {
  const shop = await shopFor(event)
  if (!shop) return unauthorised
  const input = body<Input>(event)
  const format = input?.format === "jpg" ? "jpeg" : (input?.format as ImageFormat | undefined)
  const orderRef = input?.orderRef?.trim()
  if (!input?.image || !format || !formats.has(format) || !orderRef) return json(400, { error: "Send a png, jpeg, gif or webp screenshot and an order reference." })

  const image = Buffer.from(input.image, "base64")
  const screenshotSha256 = sha256(image)
  await s3.send(new PutObjectCommand({ Bucket: env("UPLOAD_BUCKET"), Key: `${shop.id}/${screenshotSha256}.${format}`, Body: image, ContentType: `image/${format}` }))

  const read = await readScreenshot(bedrock, env("MODEL_ID"), image, format)
  let retries = 0
  const decision = await claim(pool(), { shopId: shop.id, shopVpas: shop.vpas, read, orderRef, screenshotSha256 }, () => retries++)
  await pool().query("INSERT INTO attempts (shop_id, screenshot_sha256, extracted, verdict, reason) VALUES ($1, $2, $3, $4, $5)", [shop.id, screenshotSha256, JSON.stringify(read), decision.verdict, decision.reason])
  return json(200, { ...decision, read, retries })
}
