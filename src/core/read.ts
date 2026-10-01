import { BedrockRuntimeClient, ConverseCommand, type ImageFormat } from "@aws-sdk/client-bedrock-runtime"
import { rupeesToPaise } from "./money.js"
import { normaliseUtr } from "./verdict.js"
import type { ScreenshotRead } from "./types.js"

const tool = {
  name: "report_payment",
  description: "Report the fields printed on a UPI payment screenshot. Copy text exactly as shown. Use null for anything not clearly visible.",
  inputSchema: {
    json: {
      type: "object",
      properties: {
        readable: { type: "boolean", description: "False if this is not a UPI payment confirmation or the key text is blurred, cropped or hidden." },
        utr: { type: ["string", "null"], description: "The 12-digit UPI transaction ID / UTR / UPI Ref No." },
        amount: { type: ["string", "null"], description: "The paid amount exactly as printed, digits only with optional decimals, no currency sign." },
        payeeVpa: { type: ["string", "null"], description: "The recipient UPI ID (contains @)." },
        payeeName: { type: ["string", "null"] },
        app: { type: ["string", "null"], description: "gpay, phonepe, paytm, bhim or other." },
      },
      required: ["readable", "utr", "amount", "payeeVpa", "payeeName", "app"],
    },
  },
}

type Raw = { readable?: boolean; utr?: string | null; amount?: string | null; payeeVpa?: string | null; payeeName?: string | null; app?: string | null }

export function toRead(raw: Raw): ScreenshotRead {
  const utr = raw.utr ? normaliseUtr(raw.utr) : null
  const amountPaise = raw.amount ? rupeesToPaise(raw.amount.replace(/[₹]|Rs\.?|INR/gi, "")) : null
  const validUtr = utr && utr.length === 12 ? utr : null
  return {
    readable: raw.readable === true && validUtr !== null && amountPaise !== null,
    utr: validUtr,
    amountPaise,
    payeeVpa: raw.payeeVpa?.includes("@") ? raw.payeeVpa.trim() : null,
    payeeName: raw.payeeName?.trim() || null,
    app: raw.app?.trim().toLowerCase() || null,
  }
}

export async function readScreenshot(client: BedrockRuntimeClient, modelId: string, image: Uint8Array, format: ImageFormat): Promise<ScreenshotRead> {
  const out = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ image: { format, source: { bytes: image } } }, { text: "Read this payment screenshot and call report_payment." }] }],
      toolConfig: { tools: [{ toolSpec: tool }], toolChoice: { tool: { name: tool.name } } },
      inferenceConfig: { temperature: 0, maxTokens: 400 },
    }),
  )
  const use = out.output?.message?.content?.find((c) => c.toolUse)?.toolUse
  return toRead((use?.input ?? {}) as Raw)
}
