import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`${name} is not set`)
    process.exit(1)
  }
  return value
}

export function apiUrl(): string {
  return requireEnv("API_URL").replace(/\/+$/, "")
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`${name} must be a positive integer`)
    process.exit(1)
  }
  return n
}

export type Timed<T> = { status: number; ms: number; body: T }

export async function post<T>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<Timed<T>> {
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { status: 0, ms: performance.now() - started, body: { networkError: e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e) } as T }
  }
  const text = await res.text()
  const ms = performance.now() - started
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { nonJson: text }
  }
  return { status: res.status, ms, body: parsed as T }
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!
}

export function fmtMs(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value)} ms`
}

export function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.map(String).join(" | ")} |`
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n")
}

export async function writeResult(name: string, data: unknown): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const file = join(repoRoot, "measurements", `${name}-${stamp}.json`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}

export function meta(): { apiUrl: string; startedAt: string; node: string } {
  return { apiUrl: apiUrl(), startedAt: new Date().toISOString(), node: process.version }
}

export function mboxMessages(mbox: string): string[] {
  return mbox
    .replace(/\r\n/g, "\n")
    .split(/\n(?=From \S+ +\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4}\n)/)
    .map((m) => m.replace(/^From [^\n]*\n/, "").replace(/\n>From /g, "\nFrom "))
    .filter((m) => /^dkim-signature:/im.test(m))
}
