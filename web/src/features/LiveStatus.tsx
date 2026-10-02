import { useCallback, useEffect, useState } from "react"
import "./features.css"

export type Health = "good" | "warn" | "bad"

export type LiveStatusData = {
  dkim?: { domain?: string; selector?: string; fingerprint?: string; verifies?: boolean; ms?: number }
  dsql?: { ok?: boolean; ms?: number }
  kms?: { keyId?: string }
  reader?: string[]
}

export type StatusLoad =
  | { state: "loading" }
  | { state: "missing"; at: Date }
  | { state: "error"; message: string; at: Date }
  | { state: "ready"; data: LiveStatusData; at: Date; ms: number }

const path = "/api/status"

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined
}

export function parseStatus(raw: unknown): LiveStatusData {
  const top = asObject(raw) ?? {}
  const dkim = asObject(top.dkim)
  const dsql = asObject(top.dsql)
  const kms = asObject(top.kms)
  const readers = asObject(top.readers)
  const named = readers ? [str(readers.check) && `check ${str(readers.check)}`, str(readers.read) && `read ${str(readers.read)}`].filter((r): r is string => Boolean(r)) : undefined
  const reader = named ?? (Array.isArray(top.reader) ? top.reader.filter((r): r is string => typeof r === "string") : typeof top.reader === "string" ? [top.reader] : undefined)
  const keyId = str(top.receiptKeyId) ?? str(kms?.keyId)
  return {
    ...(dkim
      ? { dkim: { domain: str(dkim.domain), selector: str(dkim.selector), fingerprint: str(dkim.keySha256) ?? str(dkim.fingerprint), verifies: bool(dkim.verifiesSample) ?? bool(dkim.verifies), ms: num(dkim.lookupMs) ?? num(dkim.ms) } }
      : {}),
    ...(dsql ? { dsql: { ok: bool(dsql.reachable) ?? bool(dsql.ok), ms: num(dsql.ms) } } : {}),
    ...(keyId ? { kms: { keyId } } : {}),
    ...(reader ? { reader } : {}),
  }
}

export async function fetchStatus(signal?: AbortSignal): Promise<StatusLoad> {
  const started = performance.now()
  try {
    const res = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store", ...(signal ? { signal } : {}) })
    const at = new Date()
    if (res.status === 404) return { state: "missing", at }
    const type = res.headers.get("content-type") ?? ""
    if (!type.includes("json")) return res.ok ? { state: "missing", at } : { state: "error", message: `Status ${res.status}`, at }
    const body: unknown = await res.json().catch(() => null)
    const top = asObject(body)
    if (!top) return { state: "error", message: `Status ${res.status}`, at }
    if (!res.ok && !top.dkim && !top.dsql) return { state: "error", message: str(top.error) ?? str(top.message) ?? `Status ${res.status}`, at }
    return { state: "ready", data: parseStatus(body), at, ms: Math.round(performance.now() - started) }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    return { state: "error", message: e instanceof Error ? e.message : String(e), at: new Date() }
  }
}

export function useStatus(everyMs = 0): [StatusLoad, () => void] {
  const [load, setLoad] = useState<StatusLoad>({ state: "loading" })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    const ctl = new AbortController()
    fetchStatus(ctl.signal).then(setLoad, () => undefined)
    const timer = everyMs > 0 ? window.setInterval(() => fetchStatus(ctl.signal).then(setLoad, () => undefined), everyMs) : undefined
    return () => {
      ctl.abort()
      if (timer) window.clearInterval(timer)
    }
  }, [tick, everyMs])
  return [load, refresh]
}

export type Alive = "checking" | "up" | "down"

export function useApiAlive(everyMs = 60_000): Alive {
  const [load] = useStatus(everyMs)
  if (load.state === "loading") return "checking"
  return load.state === "ready" ? "up" : "down"
}

export function AliveDot({ everyMs }: { everyMs?: number }) {
  const alive = useApiAlive(everyMs)
  const tone = alive === "up" ? "good" : alive === "down" ? "bad" : ""
  const text = alive === "up" ? "API up" : alive === "down" ? "API down" : "Checking API"
  return (
    <span className="alive" role="status">
      <span className={`status-dot ${tone}`} aria-hidden="true" />
      {text}
    </span>
  )
}

function clock(at: Date): string {
  return at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function short(text: string, keep = 10): string {
  return text.length > keep * 2 + 1 ? `${text.slice(0, keep)}…${text.slice(-keep)}` : text
}

type Row = { name: string; health: Health; detail: string; ms?: number }

export function statusRows(data: LiveStatusData): Row[] {
  const rows: Row[] = []
  const d = data.dkim
  if (d) {
    const signer = [d.selector, d.domain].filter(Boolean).join("._domainkey.")
    const key = d.fingerprint ? `key ${short(d.fingerprint)}` : ""
    const says = d.verifies === true ? "Sample alert verifies" : d.verifies === false ? "Sample alert fails" : "Not checked"
    rows.push({ name: "DKIM", health: d.verifies === true ? "good" : d.verifies === false ? "bad" : "warn", detail: [says, signer, key].filter(Boolean).join(", "), ...(d.ms !== undefined ? { ms: d.ms } : {}) })
  } else rows.push({ name: "DKIM", health: "warn", detail: "Not reported" })
  const q = data.dsql
  rows.push(q ? { name: "Aurora DSQL", health: q.ok === true ? "good" : q.ok === false ? "bad" : "warn", detail: q.ok === true ? "Query answered" : q.ok === false ? "Query failed" : "Not checked", ...(q.ms !== undefined ? { ms: q.ms } : {}) } : { name: "Aurora DSQL", health: "warn", detail: "Not reported" })
  const k = data.kms
  rows.push(k?.keyId ? { name: "KMS", health: "good", detail: `Signing key ${short(k.keyId, 8)}` } : { name: "KMS", health: "warn", detail: "No key reported" })
  const r = data.reader
  rows.push(r && r.length > 0 ? { name: "Reader", health: "good", detail: r.join(", ") } : { name: "Reader", health: "warn", detail: "No screenshot reader reported" })
  return rows
}

export type LiveStatusProps = { everyMs?: number; title?: string }

export function LiveStatus({ everyMs = 0, title = "Live status" }: LiveStatusProps) {
  const [load, refresh] = useStatus(everyMs)
  return (
    <section className="feature-card" aria-labelledby="live-status-title" aria-busy={load.state === "loading"}>
      <header className="feature-head">
        <h2 id="live-status-title">{title}</h2>
        <span className="feature-kicker">GET /api/status</span>
      </header>
      {load.state === "loading" && <p className="muted small">Checking the deployed stack</p>}
      {load.state === "missing" && (
        <p className="muted small">
          <span className="status-dot warn" aria-hidden="true" style={{ marginRight: "0.5rem" }} />
          Status endpoint not deployed yet
        </p>
      )}
      {load.state === "error" && (
        <p className="error small">
          <span className="status-dot bad" aria-hidden="true" style={{ marginRight: "0.5rem" }} />
          Could not reach the API. {load.message}
        </p>
      )}
      {load.state === "ready" && (
        <ul className="status-list">
          {statusRows(load.data).map((row) => (
            <li key={row.name} className="status-row">
              <span className={`status-dot ${row.health}`} aria-label={row.health === "good" ? "OK" : row.health === "bad" ? "Failing" : "Unknown"} />
              <span className="status-name">{row.name}</span>
              <span className="status-detail">{row.detail}</span>
              <span className="status-ms num">{row.ms !== undefined ? `${Math.round(row.ms)} ms` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      <footer className="status-foot">
        <span>{load.state === "loading" ? "Checking" : `Checked at ${clock(load.at)} IST${load.state === "ready" ? `, round trip ${load.ms} ms` : ""}`}</span>
        <button type="button" className="secondary" onClick={refresh} disabled={load.state === "loading"}>
          Check again
        </button>
      </footer>
    </section>
  )
}
