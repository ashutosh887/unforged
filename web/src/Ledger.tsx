import { useEffect, useState } from "react"
import { post, type LedgerResult } from "./api"
import { clockTime, money, verdicts } from "./parts"
import type { Verdict } from "../../src/core/types.js"

export function Ledger({ token, version }: { token: string; version: number }) {
  const [ledger, setLedger] = useState<LedgerResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let live = true
    post<LedgerResult>("ledger", {}, token)
      .then((data) => live && (setLedger(data), setError("")))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [token, version])

  if (error) return <section className="card"><h2>Ledger</h2><p className="error">{error}</p></section>
  if (!ledger) return <section className="card muted">Loading ledger…</section>

  const claimed = ledger.credits.filter((c) => c.claim).length
  return (
    <section className="card">
      <h2>Ledger</h2>
      <p className="muted small">
        {ledger.shop.name} · paid on <span className="mono">{ledger.shop.vpas.join(", ")}</span> · {ledger.credits.length} signed credit{ledger.credits.length === 1 ? "" : "s"}, {claimed} claimed
      </p>
      {ledger.credits.length === 0 ? (
        <p className="muted">No signed bank alerts yet. Add one above.</p>
      ) : (
        <ul className="ledger">
          {ledger.credits.map((c) => (
            <li key={c.id} className={c.claim ? "spent" : "open"}>
              <div>
                <strong>{money(c.amountPaise)}</strong> <span className="muted small">{c.bank.toUpperCase()} · {clockTime(c.creditedAt)} · signed by {c.dkimDomain}</span>
                <div className="mono small">UTR {c.utr}</div>
              </div>
              <span className="small">{c.claim ? <>Claimed · order <span className="mono">{c.claim.orderRef}</span> · {clockTime(c.claim.createdAt)}</> : "Unclaimed"}</span>
            </li>
          ))}
        </ul>
      )}
      {ledger.attempts.length > 0 && (
        <>
          <h4>Recent checks</h4>
          <ul className="ledger">
            {ledger.attempts.map((a, i) => {
              const v = verdicts[a.verdict as Verdict]
              return (
                <li key={`${a.createdAt}-${i}`}>
                  <span className={`pill ${v?.tone ?? "neutral"}`}>{v?.label ?? a.verdict}</span>
                  <span className="small">
                    {a.alertOnly ? "Alert only" : "Screenshot"} · {clockTime(a.createdAt)} · {a.reason}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
