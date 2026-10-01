import { Resolver } from "node:dns/promises"
import { body, json, type Event, type Result } from "./http.js"

const label = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i

export async function handler(event: Event): Promise<Result> {
  const input = body<{ domain?: string; selector?: string; n?: number }>(event)
  const domain = input?.domain?.trim().toLowerCase() ?? ""
  const selector = input?.selector?.trim() ?? ""
  if (!label.test(domain) || !label.test(selector)) return json(400, { error: "Send a DKIM domain and selector." })
  const n = Math.min(Math.max(Math.trunc(input?.n ?? 50), 1), 100)
  const name = `${selector}._domainkey.${domain}`
  const samples: { ms: number; ok: boolean; error?: string }[] = []
  for (let i = 0; i < n; i++) {
    const resolver = new Resolver()
    const started = performance.now()
    try {
      await resolver.resolveTxt(name)
      samples.push({ ms: performance.now() - started, ok: true })
    } catch (e) {
      samples.push({ ms: performance.now() - started, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return json(200, { region: process.env.AWS_REGION, name, samples })
}
