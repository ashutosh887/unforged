import { useEffect, useState } from "react"
import { post, type Receipt, type ReceiptResult } from "./api"
import { checkInBrowser, keyPem, type BrowserCheck } from "./chain"
import { ReceiptQr } from "./features/ReceiptQr"
import { Icon } from "./Icon"
import { hrefOf } from "./router"

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; receipt: Receipt; verified: boolean }
type Browser = { state: "idle" } | { state: "checking" } | { state: "done"; check: BrowserCheck } | { state: "error"; message: string }

function ist(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST`
}

function short(hex: string): string {
  return /^0+$/.test(hex) ? "None, first entry" : `${hex.slice(0, 8)}…${hex.slice(-8)}`
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ReceiptPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [copied, setCopied] = useState(false)
  const [full, setFull] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [browser, setBrowser] = useState<Browser>({ state: "idle" })

  useEffect(() => {
    let live = true
    post<ReceiptResult>("receipts", { id })
      .then((data) => live && setLoad({ state: "ready", receipt: data.receipt, verified: data.verified }))
      .catch((e: unknown) => live && setLoad({ state: "error", message: message(e) }))
    return () => {
      live = false
    }
  }, [id])

  const copy = async () => {
    await navigator.clipboard.writeText(location.href).catch(() => undefined)
    setCopied(true)
  }

  if (load.state === "loading")
    return (
      <section className="slip loading" aria-busy="true">
        <p className="muted">Loading receipt {id}</p>
      </section>
    )
  if (load.state === "error")
    return (
      <section className="slip">
        <h1 className="slip-what">Receipt not found</h1>
        <p className="error">{load.message}</p>
      </section>
    )

  const r = load.receipt
  const verify = async () => {
    setBrowser({ state: "checking" })
    try {
      setBrowser({ state: "done", check: await checkInBrowser(r) })
    } catch (e) {
      setBrowser({ state: "error", message: message(e) })
    }
  }
  const showKey = async () => setKey(await keyPem(r.keyId).catch(message))

  return (
    <article className={`slip ${load.verified ? "good" : "bad"}`}>
      <header className="slip-top">
        <span className="slip-mark">
          <Icon name={load.verified ? "check" : "cross"} size={24} />
        </span>
        <p className="slip-state">{load.verified ? "Claimed once" : "This receipt failed its check"}</p>
        <h1 className="slip-what">{r.what.charAt(0).toUpperCase() + r.what.slice(1)}</h1>
        <p className="slip-sub">
          {r.kind === "signed-email" ? "Signed email" : "Bank credit"} from <strong>{r.signer}</strong>
        </p>
        <p className="slip-time">{ist(r.claimedAt)}</p>
      </header>
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
              <small>This, entry {r.seq}</small>
              <span className="hex">{short(r.hash)}</span>
            </span>
          </span>
        </dd>
        <dt>Signature</dt>
        <dd>
          <span className={`sig-state ${load.verified ? "good" : "bad"}`}>
            <Icon name={load.verified ? "check" : "cross"} size={15} /> {load.verified ? "AWS KMS, ECDSA P-256" : "Does not check out"}
          </span>
          <button type="button" className="hex sig" aria-expanded={full} onClick={() => setFull((f) => !f)}>
            {full ? r.signature : `${r.signature.slice(0, 28)}…`}
          </button>
        </dd>
      </dl>
      <div className="slip-verify">
        <button type="button" className="secondary" onClick={() => void verify()} disabled={browser.state === "checking"}>
          <Icon name="key" size={16} /> {browser.state === "checking" ? "Checking" : "Verify in your browser"}
        </button>
        {browser.state === "done" && (
          <ul aria-live="polite">
            <li className={browser.check.hash ? "good" : "bad"}>
              <Icon name={browser.check.hash ? "check" : "cross"} size={15} /> SHA-256 hash {browser.check.hash ? "matches" : "does not match"}
            </li>
            <li className={browser.check.signature ? "good" : "bad"}>
              <Icon name={browser.check.signature ? "check" : "cross"} size={15} /> KMS signature {browser.check.signature ? "checks out with WebCrypto" : "fails"}
            </li>
          </ul>
        )}
        {browser.state === "error" && <p className="error small">{browser.message}</p>}
      </div>
      <div className="slip-qr">
        <ReceiptQr url={`/#r=${r.id}`} size={148} showUrl={false} />
      </div>
      <div className="slip-actions">
        <button type="button" className="primary" onClick={() => void copy()}>
          <Icon name="copy" size={16} /> {copied ? "Link copied" : "Copy receipt link"}
        </button>
        <button type="button" className="secondary" disabled={key !== null} onClick={() => void showKey()}>
          Show the public key
        </button>
        <a className="text" href={`${hrefOf.ledger}/${r.ledger}`}>
          See its ledger
        </a>
      </div>
      {key && <pre className="pem">{key}</pre>}
      <p className="slip-foot">It holds no email body and no UPI ID.</p>
    </article>
  )
}
