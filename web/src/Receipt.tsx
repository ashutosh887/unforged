import { useEffect, useState } from "react"
import { post, type ReceiptResult } from "./api"

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: ReceiptResult }

function ist(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST`
}

export function receiptIdFromHash(): string | null {
  const id = new URLSearchParams(location.hash.slice(1)).get("r")
  return id && /^[0-9A-Za-z]{22}$/.test(id) ? id : null
}

export function ReceiptPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    post<ReceiptResult>("receipts", { id })
      .then((data) => live && setLoad({ state: "ready", data }))
      .catch((e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [id])

  const copy = async () => {
    await navigator.clipboard.writeText(location.href).catch(() => undefined)
    setCopied(true)
  }

  if (load.state === "loading") return <section className="card muted">Loading receipt {id}</section>
  if (load.state === "error") return <section className="card"><h2>Receipt not found</h2><p className="error">{load.message}</p></section>

  const { receipt, verified, check } = load.data
  const tone = verified ? "good" : "bad"
  return (
    <article className={`verdict receipt ${tone}`}>
      <h4>Claim receipt</h4>
      <h3>{verified ? "Verified · claimed once" : "Receipt failed its check"}</h3>
      <p>
        {receipt.kind === "bank-credit" ? "A bank credit alert" : "A signed email"} from <strong>{receipt.signer}</strong> was claimed for <strong>{receipt.what}</strong>.
      </p>
      <dl className="facts">
        <dt>Claimed</dt>
        <dd>{ist(receipt.claimedAt)}</dd>
        <dt>Receipt</dt>
        <dd className="mono">{receipt.id}</dd>
        <dt>Ledger</dt>
        <dd className="mono">
          {receipt.ledger}, entry {receipt.seq}
        </dd>
        <dt>Hash</dt>
        <dd className="mono">{receipt.hash}</dd>
        <dt>Previous</dt>
        <dd className="mono">{receipt.prevHash}</dd>
        <dt>Signature</dt>
        <dd>
          ECDSA P-256 by AWS KMS, {check.signature ? "checks out" : "does not check out"}. Hash {check.hash ? "matches" : "does not match"} its contents.
        </dd>
      </dl>
      <div className="release">
        <button type="button" onClick={() => void copy()}>
          {copied ? "Link copied" : "Copy link"}
        </button>
        <p className="muted small">
          Anyone can check this receipt offline against the public key at <span className="mono">/api/receipts/key</span>. The receipt holds no email body and no UPI ID.
        </p>
      </div>
    </article>
  )
}
