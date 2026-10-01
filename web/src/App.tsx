import { useEffect, useState, type DragEvent, type FormEvent } from "react"
import { encodeImage, post, type AlertResult, type CheckResult } from "./api"
import { Demo } from "./Demo"
import { money, Race, useAction, VerdictCard } from "./parts"

type View = "try" | "shop"

const tokenKey = "unforged.token"

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

  return (
    <main>
      <header className="hero">
        <h1>Unforged</h1>
        <p className="claim">A signed email is proof nobody can forge, and each proof can be claimed exactly once.</p>
        <p className="lede">
          First case: is that UPI payment screenshot real? Unforged checks it against the seller's own bank credit alert, verified by the bank's DKIM signature. Bedrock reads the
          screenshot, code decides, and each bank credit can back one order only.
        </p>
      </header>
      <nav className="tabs" aria-label="Views">
        <button type="button" className={view === "try" ? "on" : ""} aria-pressed={view === "try"} onClick={() => setView("try")}>
          Try it
        </button>
        <button type="button" className={view === "shop" ? "on" : ""} aria-pressed={view === "shop"} onClick={() => setView("shop")}>
          Your shop
        </button>
      </nav>
      {view === "try" ? <Demo /> : token ? <Workspace token={token} /> : <ShopSetup onToken={setToken} />}
      <Race />
    </main>
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
      <h2>Your shop</h2>
      <form onSubmit={submit} className="stack">
        <label>
          Shop name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="organization" />
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
      <AlertBox token={token} />
      <ScreenshotBox token={token} />
    </>
  )
}

function AlertBox({ token }: { token: string }) {
  const [raw, setRaw] = useState("")
  const action = useAction<AlertResult>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(() => post("alerts", { raw }, token))
  }
  return (
    <section className="card">
      <h2>Bank alert</h2>
      <form onSubmit={submit} className="stack">
        <label>
          Raw credit alert email (Gmail: Show original, copy all)
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} spellCheck={false} required />
        </label>
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

function ScreenshotBox({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [orderRef, setOrderRef] = useState("")
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
    void action.run(async () => post("check", { ...(await encodeImage(file)), orderRef }, token))
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
          <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="Order 1042" required />
        </label>
        <button disabled={action.busy || !file}>{action.busy ? "Reading…" : "Check payment"}</button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && <VerdictCard result={action.result} />}
    </section>
  )
}
