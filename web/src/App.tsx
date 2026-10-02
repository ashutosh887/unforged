import { useEffect, useState, type DragEvent, type FormEvent } from "react"
import { encodeImage, post, type AlertResult, type CheckResult } from "./api"
import { Demo } from "./Demo"
import { Ledger } from "./Ledger"
import { money, Race, RawEmailField, useAction, VerdictCard } from "./parts"
import { SignatureCheck } from "./Signature"
import { ReceiptPage, receiptIdFromHash } from "./Receipt"
import { Theater } from "./Theater"
import { UpiCase } from "./UpiCase"

type View = "try" | "shop"
type Mode = "screenshot" | "alert"

const tokenKey = "unforged.token"

const sampleEmail = {
  label: "Use a sample signed email",
  load: async () => {
    const res = await fetch("/samples/sample.eml", { cache: "no-cache" }).catch(() => null)
    if (!res?.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null
    return res.text()
  },
}

function initialToken(): string {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("t")
  if (fromHash) {
    try {
      localStorage.setItem(tokenKey, fromHash)
    } catch {}
    return fromHash
  }
  try {
    return localStorage.getItem(tokenKey) ?? ""
  } catch {
    return ""
  }
}

function initialView(token: string): View {
  const hash = new URLSearchParams(location.hash.slice(1))
  if (hash.has("try")) return "try"
  return token ? "shop" : "try"
}

export function App() {
  const [token, setToken] = useState(initialToken)
  const [view, setView] = useState<View>(() => initialView(token))
  const [receiptId, setReceiptId] = useState(receiptIdFromHash)

  useEffect(() => {
    const follow = () => setReceiptId(receiptIdFromHash())
    addEventListener("hashchange", follow)
    return () => removeEventListener("hashchange", follow)
  }, [])

  if (receiptId) {
    return (
      <main>
        <Masthead />
        <header className="hero hero-receipt">
          <h1>A receipt for one signed record, claimed once.</h1>
          <p className="lede">AWS KMS signed it, and every receipt in its ledger links to the one before.</p>
        </header>
        <div className="narrow">
          <ReceiptPage id={receiptId} />
          <a className="ghost-link" href="#try">
            See how Unforged checks a payment
          </a>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Masthead onShop={() => setView("shop")} />
      <header className="hero">
        <h1>Proof nobody can forge, claimed exactly once.</h1>
        <div className="hero-side">
          <p className="lede">
            A signed email is that proof. A buyer's UPI screenshot can be edited, or shown again for a second order. The bank's signed credit alert can't. Below, a real signed email goes through the live AWS stack, one step at a time.
          </p>
          <p className="live-badge">
            <span className="dot" aria-hidden="true" />
            Live on AWS. In recorded runs, 20 of 20 races ended with one winner and 37 of 37 edited emails were caught.
          </p>
        </div>
      </header>
      <Theater />
      <UpiCase onShop={() => setView("shop")} />
      <div className="app" id="app">
      <div className="app-head">
        <h2>Try it yourself</h2>
        <p className="muted">Check any email you received, or set up a shop and check real payment screenshots against your bank's alerts.</p>
      </div>
      <nav className="tabs" aria-label="Views">
        <button type="button" className={view === "try" ? "on" : ""} aria-pressed={view === "try"} onClick={() => setView("try")}>
          Try it
        </button>
        <button type="button" className={view === "shop" ? "on" : ""} aria-pressed={view === "shop"} onClick={() => setView("shop")}>
          Your shop
        </button>
      </nav>
      {view === "try" ? (
        <>
          <SignatureCheck sample={sampleEmail} />
          <Demo />
        </>
      ) : token ? (
        <>
          <Workspace token={token} />
          <Race />
        </>
      ) : (
        <ShopSetup onToken={setToken} />
      )}
      </div>
    </main>
  )
}

function Masthead({ onShop }: { onShop?: () => void }) {
  return (
    <nav className="masthead" aria-label="Unforged">
      <a className="wordmark" href="#try">
        <Seal />
        Unforged
      </a>
      <span className="masthead-links">
        <a href="#own">Check your own email</a>
        {onShop && (
          <a
            href="#app"
            onClick={() => {
              onShop()
            }}
          >
            Your shop
          </a>
        )}
      </span>
    </nav>
  )
}

function Seal() {
  return (
    <svg className="seal" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 6l8.5 6.5L20.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="16.5" r="4" fill="var(--carbon)" stroke="var(--sheet)" strokeWidth="1.4" />
      <path d="M15.8 16.6l1.2 1.2 2.3-2.4" fill="none" stroke="var(--sheet)" strokeWidth="1.4" />
    </svg>
  )
}

function ShopSetup({ onToken }: { onToken: (t: string) => void }) {
  const [name, setName] = useState("")
  const [vpa, setVpa] = useState("")
  const action = useAction<{ shopId: string; token: string }>()

  useEffect(() => {
    if (!action.result) return
    try {
      localStorage.setItem(tokenKey, action.result.token)
    } catch {}
    history.replaceState(null, "", `#t=${action.result.token}`)
    onToken(action.result.token)
  }, [action.result, onToken])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(() => post("shops", { name, vpas: [vpa] }))
  }

  return (
    <section className="card">
      <h2>Set up your shop</h2>
      <p className="muted small">You get a private link instead of a login. Anyone with the link can check payments for this shop, so keep it to yourself.</p>
      <form onSubmit={submit} className="stack">
        <label>
          Shop name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="organization" />
        </label>
        <label>
          UPI ID you are paid on
          <input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okhdfc" required inputMode="email" autoCapitalize="off" />
        </label>
        <button disabled={action.busy}>{action.busy ? "Creating…" : "Create shop"}</button>
        {action.error && <p className="error">{action.error}</p>}
      </form>
    </section>
  )
}

function Workspace({ token }: { token: string }) {
  const [mode, setMode] = useState<Mode>("screenshot")
  const [version, setVersion] = useState(0)
  const changed = () => setVersion((v) => v + 1)
  const link = `${location.origin}${location.pathname}#t=${token}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => undefined)
    setCopied(true)
  }
  return (
    <>
      <section className="card link">
        <span>Your private shop link</span>
        <button type="button" className="ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </section>
      <nav className="tabs modes" aria-label="Check mode">
        <button type="button" className={mode === "screenshot" ? "on" : ""} aria-pressed={mode === "screenshot"} onClick={() => setMode("screenshot")}>
          Check a screenshot
        </button>
        <button type="button" className={mode === "alert" ? "on" : ""} aria-pressed={mode === "alert"} onClick={() => setMode("alert")}>
          Alert only
        </button>
      </nav>
      {mode === "screenshot" ? (
        <>
          <AlertBox token={token} onDone={changed} />
          <ScreenshotBox token={token} onDone={changed} />
        </>
      ) : (
        <ClaimAlertBox token={token} onDone={changed} />
      )}
      <Ledger token={token} version={version} />
    </>
  )
}

function AlertBox({ token, onDone }: { token: string; onDone: () => void }) {
  const [raw, setRaw] = useState("")
  const action = useAction<AlertResult>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(() => post<AlertResult>("alerts", { raw }, token).finally(onDone))
  }
  return (
    <section className="card">
      <h2>Bank alert</h2>
      <form onSubmit={submit} className="stack">
        <RawEmailField value={raw} onChange={setRaw} label="Raw credit alert email (Gmail: ⋮ → Show original → Copy to clipboard)" />
        <button disabled={action.busy || !raw.trim()}>{action.busy ? "Checking signature…" : "Add alert"}</button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && (
        <dl className="facts">
          <dt>Bank</dt>
          <dd>{action.result.credit.bank.toUpperCase()}</dd>
          <dt>UTR</dt>
          <dd className="mono">{action.result.credit.utr}</dd>
          <dt>Amount</dt>
          <dd>{money(action.result.credit.amountPaise)}</dd>
          <dt>Signed by</dt>
          <dd>{action.result.credit.dkimDomain}</dd>
          {action.result.duplicate && (
            <>
              <dt>Note</dt>
              <dd>This alert was already stored.</dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}

function ClaimAlertBox({ token, onDone }: { token: string; onDone: () => void }) {
  const [raw, setRaw] = useState("")
  const [orderRef, setOrderRef] = useState("")
  const [submitted, setSubmitted] = useState("")
  const action = useAction<AlertResult>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(orderRef)
    void action.run(() => post<AlertResult>("alerts", { raw, orderRef }, token).finally(onDone))
  }
  return (
    <section className="card">
      <h2>Claim a signed alert directly</h2>
      <p className="muted small">No screenshot. Paste the bank's signed credit alert and the order it pays for. Each alert can back one order only.</p>
      <form onSubmit={submit} className="stack">
        <RawEmailField value={raw} onChange={setRaw} label="Raw credit alert email (Gmail: ⋮ → Show original → Copy to clipboard)" />
        <label>
          Order reference
          <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="Order 1042" maxLength={80} required />
        </label>
        <button disabled={action.busy || !raw.trim() || !orderRef.trim()}>{action.busy ? "Checking signature…" : "Claim alert"}</button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result &&
        (action.result.decision ? (
          <VerdictCard result={action.result.decision} orderRef={submitted} bankFallback={action.result.credit} />
        ) : (
          <p className="muted small">Alert stored, but the server returned no claim decision.</p>
        ))}
    </section>
  )
}

function ScreenshotBox({ token, onDone }: { token: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [orderRef, setOrderRef] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [over, setOver] = useState(false)
  const action = useAction<CheckResult>()

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith("image/")) setFile(f)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setSubmitted(orderRef)
    void action.run(async () => post<CheckResult>("check", { ...(await encodeImage(file)), orderRef }, token).finally(onDone))
  }

  return (
    <section className="card">
      <h2>Payment screenshot</h2>
      <form onSubmit={submit} className="stack">
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {preview ? <img src={preview} alt="Screenshot to check" /> : <span>Drop a screenshot or tap to choose</span>}
        </label>
        <label>
          Order reference
          <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="Order 1042" maxLength={80} required />
        </label>
        <button disabled={action.busy || !file}>{action.busy ? "Reading…" : "Check payment"}</button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && <VerdictCard result={action.result} orderRef={submitted} />}
    </section>
  )
}
