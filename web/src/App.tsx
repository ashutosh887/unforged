import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react"
import type { Verdict } from "../../src/core/types.js"
import { formatPaise } from "../../src/core/money.js"
import { encodeImage, post, type AlertResult, type CheckResult, type RaceResult } from "./api"

type Tone = "good" | "warn" | "bad" | "neutral"

const verdicts: Record<Verdict, { label: string; tone: Tone }> = {
  VERIFIED: { label: "Verified", tone: "good" },
  ALREADY_CLAIMED: { label: "Already claimed", tone: "warn" },
  AMOUNT_MISMATCH: { label: "Amount mismatch", tone: "bad" },
  PAYEE_MISMATCH: { label: "Payee mismatch", tone: "bad" },
  NOT_FOUND_YET: { label: "Not found yet", tone: "neutral" },
  UNREADABLE: { label: "Unreadable", tone: "neutral" },
}

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

function money(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? "—" : formatPaise(paise)
}

function useAction<T>() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<T | null>(null)
  const run = useCallback(async (task: () => Promise<T>) => {
    setBusy(true)
    setError("")
    try {
      setResult(await task())
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, result, run }
}

export function App() {
  const [token, setToken] = useState(initialToken)

  return (
    <main>
      <header>
        <h1>Unforged</h1>
        <p className="lede">Check a UPI payment screenshot against the bank's own signed credit alert.</p>
      </header>
      {token ? <Workspace token={token} /> : <ShopSetup onToken={setToken} />}
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

function VerdictCard({ result }: { result: CheckResult }) {
  const v = verdicts[result.verdict]
  return (
    <article className={`verdict ${v.tone}`}>
      <h3>{v.label}</h3>
      <p>{result.reason}</p>
      <div className="compare">
        <dl className="facts">
          <dt>Screenshot UTR</dt>
          <dd className="mono">{result.read.utr ?? "—"}</dd>
          <dt>Screenshot amount</dt>
          <dd>{money(result.read.amountPaise)}</dd>
          <dt>Paid to</dt>
          <dd>{result.read.payeeVpa ?? "—"}</dd>
        </dl>
        {result.credit && (
          <dl className="facts">
            <dt>Bank UTR</dt>
            <dd className="mono">{result.credit.utr}</dd>
            <dt>Bank amount</dt>
            <dd>{money(result.credit.amountPaise)}</dd>
            <dt>Signed by</dt>
            <dd>{result.credit.dkimDomain}</dd>
          </dl>
        )}
      </div>
    </article>
  )
}

function Race() {
  const action = useAction<RaceResult>()
  const n = 50
  return (
    <section className="card">
      <h2>Race</h2>
      <p className="muted">{n} claims for one bank credit at the same instant, with and without the unique index.</p>
      <button type="button" disabled={action.busy} onClick={() => void action.run(() => post("race", { n }))}>
        {action.busy ? "Racing…" : `Race ${n} claims`}
      </button>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && (
        <div className="compare">
          <div className={`tally ${action.result.guarded.verified === 1 ? "good" : "bad"}`}>
            <strong>{action.result.guarded.verified}</strong>
            <span>accepted with the unique index</span>
            <small>
              {action.result.guarded.alreadyClaimed} already claimed · {action.result.guarded.retries} retries · {action.result.guarded.ms} ms
            </small>
          </div>
          <div className={`tally ${action.result.naive.accepted === 1 ? "good" : "bad"}`}>
            <strong>{action.result.naive.accepted}</strong>
            <span>accepted by check-then-insert</span>
            <small>{action.result.naive.errors} errors</small>
          </div>
        </div>
      )}
    </section>
  )
}
