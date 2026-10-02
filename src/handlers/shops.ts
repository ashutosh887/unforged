import { body, demoSenders, json, limits, newToken, pool, sha256, text, type Event, type Result } from "./http.js"

type Input = { name?: unknown; vpas?: unknown }

const demoShop = { name: "Demo visit", vpas: ["demo.seller@okicici"] }

async function createDemo(): Promise<Result> {
  const token = newToken(true)
  const { rows } = await pool().query<{ id: string }>("INSERT INTO shops (name, token_hash, vpas) VALUES ($1, $2, $3) RETURNING id", [demoShop.name, sha256(token), demoShop.vpas.join(",")])
  return json(201, { shopId: rows[0]!.id, token, name: demoShop.name, vpas: demoShop.vpas, demo: true, demoBanks: demoSenders().map((s) => s.split("@").pop()!) })
}

export async function handler(event: Event): Promise<Result> {
  if (event.rawPath?.endsWith("/demo/shop")) return createDemo()
  const input = body<Input>(event)
  const name = text(input?.name)?.trim()
  const vpas = (Array.isArray(input?.vpas) ? input.vpas : []).flatMap((v) => text(v)?.trim().toLowerCase() ?? []).filter((v) => v.includes("@"))
  if (!name || vpas.length === 0) return json(400, { error: "A shop needs a name and at least one UPI ID." })
  if (name.length > limits.shopName) return json(400, { error: `Keep the shop name under ${limits.shopName} characters.` })
  if (vpas.length > limits.vpas || vpas.some((v) => v.length > limits.vpa)) return json(400, { error: `Up to ${limits.vpas} UPI IDs, each under ${limits.vpa} characters.` })
  const token = newToken()
  const { rows } = await pool().query<{ id: string }>("INSERT INTO shops (name, token_hash, vpas) VALUES ($1, $2, $3) RETURNING id", [name, sha256(token), vpas.join(",")])
  return json(201, { shopId: rows[0]!.id, token })
}
