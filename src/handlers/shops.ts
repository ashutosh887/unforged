import { body, json, limits, newToken, pool, sha256, type Event, type Result } from "./http.js"

type Input = { name?: string; vpas?: string[] }

export async function handler(event: Event): Promise<Result> {
  const input = body<Input>(event)
  const name = input?.name?.trim()
  const vpas = (input?.vpas ?? []).map((v) => String(v).trim().toLowerCase()).filter((v) => v.includes("@"))
  if (!name || vpas.length === 0) return json(400, { error: "A shop needs a name and at least one UPI ID." })
  if (name.length > limits.shopName) return json(400, { error: `Keep the shop name under ${limits.shopName} characters.` })
  if (vpas.length > limits.vpas || vpas.some((v) => v.length > limits.vpa)) return json(400, { error: `Up to ${limits.vpas} UPI IDs, each under ${limits.vpa} characters.` })
  const token = newToken()
  const { rows } = await pool().query<{ id: string }>("INSERT INTO shops (name, token_hash, vpas) VALUES ($1, $2, $3) RETURNING id", [name, sha256(token), vpas.join(",")])
  return json(201, { shopId: rows[0]!.id, token })
}
