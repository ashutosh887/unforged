import { useEffect, useState } from "react"
import { post, type ReceiptResult } from "./api"
import { Icon } from "./Icon"

export type BuyerReceipt = { id: string; signer: string; what: string; claimedAt: string; hash: string; prevHash: string; signature: string; verified: boolean; seq?: number; kind?: "signed-email" | "bank-credit" }

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; receipt: BuyerReceipt }

function ist(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST`
}

function fromResult({ receipt, verified }: ReceiptResult): BuyerReceipt {
  return { id: receipt.id, signer: receipt.signer, what: receipt.what, claimedAt: receipt.claimedAt, hash: receipt.hash, prevHash: receipt.prevHash, signature: receipt.signature, verified, seq: receipt.seq, kind: receipt.kind }
}

function short(hex: string): string {
  return /^0+$/.test(hex) ? "None, first entry" : `${hex.slice(0, 8)}…${hex.slice(-8)}`
}

export function ReceiptPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [copied, setCopied] = useState(false)
  const [full, setFull] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const showKey = async () => {
    const data = await post<{ publicKeyPem: string }>("receipts/key", {}).catch((e: unknown) => ({ publicKeyPem: e instanceof Error ? e.message : String(e) }))
    setKey(data.publicKeyPem)
  }

  useEffect(() => {
    let live = true
    post<ReceiptResult>("receipts", { id })
      .then((data) => live && setLoad({ state: "ready", receipt: fromResult(data) }))
      .catch((e: unknown) => live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
    }
  }, [id])

  const copy = async () => {
    await navigator.clipboard.writeText(location.href).catch(() => undefined)
    setCopied(true)
  }

  if (load.state === "loading") return <section className="slip loading" aria-busy="true"><p className="muted">Loading receipt {id}</p></section>
  if (load.state === "error")
    return (
      <section className="slip">
        <h2>Receipt not found</h2>
        <p className="error">{load.message}</p>
      </section>
    )

  const r = load.receipt
  return (
    <article className={`slip ${r.verified ? "good" : "bad"}`}>
      <header className="slip-top">
        <span className="slip-mark">
          <Icon name={r.verified ? "check" : "cross"} size={26} />
        </span>
        <p className="slip-state">{r.verified ? "Claimed once" : "This receipt failed its check"}</p>
        <h1 className="slip-what">{r.what.charAt(0).toUpperCase() + r.what.slice(1)}</h1>
        <p className="slip-sub">
          {r.kind === "signed-email" ? "Signed email" : "Bank credit"} from <strong>{r.signer}</strong>
        </p>
        <p className="slip-time">{ist(r.claimedAt)}</p>
      </header>
      <div className="slip-tear" aria-hidden="true" />
      <dl className="slip-facts">
        <dt>Receipt</dt>
        <dd className="hex">{r.id}</dd>
        <dt>Chain</dt>
        <dd>
          <span className="chain">
            <span className="chain-link">
              <small>Before</small>
              <span className="hex">{short(r.prevHash)}</span>
            </span>
            <span className="chain-arrow" aria-hidden="true" />
            <span className="chain-link this">
              <small>{r.seq ? `This, entry ${r.seq}` : "This receipt"}</small>
              <span className="hex">{short(r.hash)}</span>
            </span>
          </span>
        </dd>
        <dt>Signature</dt>
        <dd>
          <span className={`sig-state ${r.verified ? "good" : "bad"}`}>
            <Icon name={r.verified ? "check" : "cross"} size={15} /> {r.verified ? "ECDSA P-256 by AWS KMS, checks out" : "Does not check out"}
          </span>
          <button type="button" className="hex sig" aria-expanded={full} onClick={() => setFull((f) => !f)}>
            {full ? r.signature : `${r.signature.slice(0, 28)}…`}
          </button>
        </dd>
      </dl>
      <div className="slip-actions">
        <button type="button" className="primary" onClick={() => void copy()}>
          <Icon name="copy" size={16} /> {copied ? "Link copied" : "Copy receipt link"}
        </button>
        <button type="button" className="secondary" disabled={key !== null} onClick={() => void showKey()}>
          Show the public key
        </button>
      </div>
      {key && <pre className="pem">{key}</pre>}
      <p className="slip-foot">Anyone can check this receipt offline with that key. It holds no email body and no UPI ID.</p>
    </article>
  )
}
