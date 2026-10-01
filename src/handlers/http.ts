import { createHash, randomBytes } from "node:crypto"
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { dsqlPool, type Pool } from "../db/client.js"

export type Event = APIGatewayProxyEventV2
export type Result = APIGatewayProxyStructuredResultV2
export type Shop = { id: string; vpas: string[] }

let shared: Pool | undefined

export function pool(): Pool {
  shared ??= dsqlPool(env("DSQL_ENDPOINT"), env("AWS_REGION"))
  return shared
}

export function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function json(statusCode: number, body: unknown): Result {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) }
}

export function body<T>(event: Event): T | null {
  if (!event.body) return null
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) as T
  } catch {
    return null
  }
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

export function newToken(): string {
  return randomBytes(24).toString("base64url")
}

export async function shopFor(event: Event): Promise<Shop | null> {
  const token = event.headers["x-shop-token"]
  if (!token) return null
  const { rows } = await pool().query<{ id: string; vpas: string }>("SELECT id, vpas FROM shops WHERE token_hash = $1", [sha256(token)])
  const row = rows[0]
  return row ? { id: row.id, vpas: row.vpas.split(",").filter(Boolean) } : null
}

export const unauthorised = json(401, { error: "Missing or unknown shop token." })
