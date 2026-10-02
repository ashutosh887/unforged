import { useEffect, useState } from "react"
import { post, type Receipt } from "../api"
import { Icon } from "../Icon"
import "./features.css"

export const genesis = "0".repeat(64)

export type ChainResult = { ledger: string; receipts: Receipt[]; checks: { id: string; signature: boolean; hash: boolean }[] }

export type LinkCheck = { id: string; seq: number; computed: string; hashOk: boolean; linkOk: boolean; seqOk: boolean; signature?: boolean }

export type ChainAudit = { links: LinkCheck[]; intact: boolean; firstBroken: { index: number; seq: number; why: string } | null }

export function canonical(receipt: Receipt): string {
  const { hash: _hash, signature: _signature, ...body } = receipt
  const ordered = Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return JSON.stringify(ordered)
}

export async function chainHash(prevHash: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(prevHash + text)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function auditChain(receipts: Receipt[], checks: ChainResult["checks"] = []): Promise<ChainAudit> {
  const signed = new Map(checks.map((c) => [c.id, c.signature]))
  const links: LinkCheck[] = []
  let firstBroken: ChainAudit["firstBroken"] = null
  for (let i = 0; i < receipts.length; i += 1) {
    const r = receipts[i]!
    const before = receipts[i - 1]
    const computed = await chainHash(r.prevHash, canonical(r))
    const hashOk = computed === r.hash
    const linkOk = before ? r.prevHash === before.hash : r.seq !== 1 || r.prevHash === genesis
    const seqOk = before ? r.seq === before.seq + 1 : true
    const signature = signed.get(r.id)
    links.push({ id: r.id, seq: r.seq, computed, hashOk, linkOk, seqOk, ...(signature !== undefined ? { signature } : {}) })
    if (!firstBroken) {
      const why = !hashOk ? "its hash does not match its contents" : !linkOk ? (before ? `it does not point to entry ${before.seq}` : "the first entry does not start from zero") : !seqOk ? `entry ${before!.seq + 1} is missing` : signature === false ? "its KMS signature does not check out" : null
      if (why) firstBroken = { index: i, seq: r.seq, why }
    }
  }
  return { links, intact: firstBroken === null, firstBroken }
}

function short(hex: string): string {
  return hex === genesis ? "0000…0000, start" : `${hex.slice(0, 10)}…${hex.slice(-6)}`
}

function ist(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST`
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; receipts: Receipt[]; audit: ChainAudit }

export type ChainViewProps = { ledger: string; limit?: number; refreshKey?: unknown } | { receipts: Receipt[]; checks?: ChainResult["checks"]; refreshKey?: unknown }

export function ChainView(props: ChainViewProps) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const ledger = "ledger" in props ? props.ledger : null
  const limit = "ledger" in props ? props.limit : undefined
  const given = "receipts" in props ? props.receipts : null
  const givenChecks = "receipts" in props ? props.checks : undefined

  useEffect(() => {
    let live = true
    setLoad({ state: "loading" })
    const source: Promise<Pick<ChainResult, "receipts" | "checks">> = given ? Promise.resolve({ receipts: given, checks: givenChecks ?? [] }) : post<ChainResult>("receipts/chain", { ledger, ...(limit ? { limit } : {}) })
    source
      .then(async ({ receipts, checks }) => {
        const ordered = [...receipts].sort((a, b) => a.seq - b.seq)
        const audit = await auditChain(ordered, checks)
        if (live) setLoad({ state: "ready", receipts: ordered, audit })
      })
      .catch((e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [ledger, limit, given, givenChecks, props.refreshKey])

  return (
    <section className="feature-card" aria-labelledby="chain-view-title" aria-busy={load.state === "loading"}>
      <header className="feature-head">
        <h2 id="chain-view-title">Receipt chain</h2>
        <span className="feature-kicker">{ledger ? `Ledger ${ledger}` : "Hashes checked in this browser"}</span>
      </header>
      {load.state === "loading" && <p className="muted small">Loading the chain and checking each hash</p>}
      {load.state === "error" && <p className="error small">{load.message}</p>}
      {load.state === "ready" && <Chain receipts={load.receipts} audit={load.audit} />}
    </section>
  )
}

function Chain({ receipts, audit }: { receipts: Receipt[]; audit: ChainAudit }) {
  if (receipts.length === 0) return <p className="ledger-verdict neutral">No receipts in this ledger yet</p>
  const broken = audit.firstBroken
  const newestFirst = receipts.map((r, i) => ({ r, link: audit.links[i]! })).reverse()
  return (
    <>
      <p className={`ledger-verdict ${audit.intact ? "good" : "bad"}`} role="status">
        <Icon name={audit.intact ? "check" : "cross"} size={18} />
        {audit.intact ? `Chain intact, ${receipts.length} ${receipts.length === 1 ? "entry" : "entries"} rechecked with WebCrypto` : `Broken at entry ${broken!.seq}, ${broken!.why}`}
      </p>
      <ol className="ledger-chain" reversed>
        {newestFirst.map(({ r, link }, k) => {
          const bad = broken !== null && broken.index === receipts.length - 1 - k
          const ok = link.hashOk && link.linkOk && link.seqOk && link.signature !== false
          const older = newestFirst[k + 1]
          return (
            <li key={r.id}>
              <article className={`ledger-entry ${bad ? "bad" : ok ? "good" : ""}`}>
                <div className="ledger-entry-top">
                  <span className="ledger-entry-what">
                    Entry {r.seq}, {r.what}
                  </span>
                  <span className="muted small">{ist(r.claimedAt)}</span>
                </div>
                <dl className="ledger-entry-hashes">
                  <dt>Hash</dt>
                  <dd className="hex" title={r.hash}>
                    {short(r.hash)} {link.hashOk ? "matches" : `recomputed ${short(link.computed)}`}
                  </dd>
                  <dt>Points to</dt>
                  <dd className="hex" title={r.prevHash}>
                    {short(r.prevHash)}
                  </dd>
                  <dt>Signer</dt>
                  <dd>
                    {r.signer}
                    {link.signature === true ? ", KMS signature checks out" : link.signature === false ? ", KMS signature fails" : ""}
                  </dd>
                </dl>
              </article>
              {(older || r.prevHash === genesis) && (
                <div className={`ledger-link ${link.linkOk && link.seqOk ? "" : "bad"}`}>
                  <span className="ledger-link-arrow" aria-hidden="true" />
                  {older ? (link.linkOk && link.seqOk ? `links to entry ${older.r.seq}` : `does not link to entry ${older.r.seq}`) : "start of the ledger"}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
