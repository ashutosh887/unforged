import { createHash, randomBytes } from "node:crypto"
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { dsqlPool, type Pool } from "../db/client.js"

export type Event = APIGatewayProxyEventV2
export type Result = APIGatewayProxyStructuredResultV2
export type Shop = { id: string; vpas: string[]; demo: boolean }

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

const demoPrefix = "demo."

export function newToken(demo = false): string {
  return `${demo ? demoPrefix : ""}${randomBytes(24).toString("base64url")}`
}

export function demoSenders(): string[] {
  return (process.env.DEMO_BANKS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"))
}

export async function shopFor(event: Event): Promise<Shop | null> {
  const token = event.headers["x-shop-token"]
  if (!token) return null
  const { rows } = await pool().query<{ id: string; vpas: string }>("SELECT id, vpas FROM shops WHERE token_hash = $1", [sha256(token)])
  const row = rows[0]
  return row ? { id: row.id, vpas: row.vpas.split(",").filter(Boolean), demo: token.startsWith(demoPrefix) } : null
}

export const limits = { shopName: 80, vpas: 5, vpa: 100, ref: 80, imageBytes: 4_000_000, emailBytes: 2_000_000 }

export function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(Math.max(n, min), max)
}

export function refFrom(value: unknown): string | null {
  const ref = text(value)?.trim()
  return ref && ref.length <= limits.ref ? ref : null
}

export const unauthorised = json(401, { error: "Missing or unknown shop token." })
