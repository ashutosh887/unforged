import { useEffect, useState } from "react"
import { post, type ChainResult, type Receipt } from "./api"
import { checkInBrowser, type BrowserCheck } from "./chain"
import { ChainView } from "./features/ChainView"
import { hrefOf } from "./router"
import { tokenKey } from "./Shop"
import { PageHead } from "./Site"

const auditedLedger = "chain-1790930647118"

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; receipts: Receipt[]; checks: BrowserCheck[] }

export function Ledger({ ledger, visitLedger }: { ledger?: string | undefined; visitLedger?: string | undefined }) {
  const shown = ledger ?? visitLedger ?? auditedLedger
  const [load, setLoad] = useState<Load>({ state: "loading" })

  useEffect(() => {
    let live = true
    setLoad({ state: "loading" })
    let token: string | undefined
    try {
      token = shown.startsWith("shop-") ? (localStorage.getItem(tokenKey) ?? undefined) : undefined
    } catch {}
    post<ChainResult>("receipts/chain", { ledger: shown, limit: 50 }, token)
      .then(async ({ receipts }) => {
        const checks = await Promise.all(receipts.map((r) => checkInBrowser(r).catch(() => ({ id: r.id, hash: false, signature: false }))))
        if (live) setLoad({ state: "ready", receipts, checks })
      })
      .catch((e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [shown])

  const signed = load.state === "ready" ? load.checks.filter((c) => c.signature).length : 0
  return (
    <>
      <PageHead title="Ledger" sub="AWS KMS signs every receipt. Each one hashes the one before it, so editing any entry breaks the chain. Your browser checks both, with WebCrypto." />
      <div className="ledger">
        <div className="ledger-pick">
          {shown === auditedLedger ? <span className="muted">The 32-receipt ledger audited on 2 Oct</span> : <span className="muted">{shown === visitLedger ? "This visit's ledger" : "Ledger"}</span>}
          <code className="hex">{shown}</code>
          {shown !== auditedLedger && (
            <a className="text" href={`${hrefOf.ledger}/${auditedLedger}`}>
              Open the 32-receipt ledger
            </a>
          )}
          {visitLedger && shown !== visitLedger && (
            <a className="text" href={`${hrefOf.ledger}/${visitLedger}`}>
              Open this visit's ledger
            </a>
          )}
        </div>
        {load.state === "loading" && <p className="muted">Fetching receipts and public keys</p>}
        {load.state === "error" && <p className="error">{load.message}</p>}
        {load.state === "ready" && (
          <>
            <p className="ledger-sigs">
              {signed} of {load.receipts.length} KMS signatures check out in this browser
            </p>
            <ChainView receipts={load.receipts} checks={load.checks} />
          </>
        )}
      </div>
    </>
  )
}
