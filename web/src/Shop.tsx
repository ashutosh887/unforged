import { useEffect, useState, type FormEvent } from "react"
import { post, type AlertResult } from "./api"
import { Icon } from "./Icon"
import { money, RawEmailField, useAction, utrGroups } from "./parts"

export const tokenKey = "unforged.token"

export function ShopSetup({ onToken }: { onToken: (t: string) => void }) {
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
    <section className="sheet">
      <h2>Set up your shop</h2>
      <p className="muted">No account. You get a private link that opens your counter. Keep it like a key.</p>
      <form onSubmit={submit} className="check-form">
        <label className="field">
          <span className="field-label">Shop name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="organization" />
        </label>
        <label className="field">
          <span className="field-label">UPI ID you are paid on</span>
          <input value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okhdfc" required inputMode="email" autoCapitalize="off" />
        </label>
        <button className="primary big" disabled={action.busy}>
          {action.busy ? "Creating your shop" : "Create shop"}
        </button>
        {action.error && <p className="error">{action.error}</p>}
      </form>
    </section>
  )
}

export function ShopLink({ token }: { token: string }) {
  const link = `${location.origin}${location.pathname}#t=${token}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => undefined)
    setCopied(true)
  }
  return (
    <section className="sheet keyline">
      <Icon name="link" size={20} />
      <div>
        <h2>Your private shop link</h2>
        <p className="muted small">Anyone with this link can check payments for your shop.</p>
      </div>
      <button type="button" className="secondary" onClick={() => void copy()}>
        <Icon name="copy" size={16} /> {copied ? "Copied" : "Copy link"}
      </button>
    </section>
  )
}

export function AlertBox({ token, onDone }: { token: string; onDone: () => void }) {
  const [raw, setRaw] = useState("")
  const action = useAction<AlertResult>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(() => post<AlertResult>("alerts", { raw }, token).finally(onDone))
  }
  return (
    <section className="sheet">
      <h2>Add a bank alert</h2>
      <p className="muted small">Paste the credit alert your bank emailed you. Unforged keeps it only if the bank's DKIM signature checks out and the sender is a known bank.</p>
      <form onSubmit={submit} className="check-form">
        <RawEmailField value={raw} onChange={setRaw} label="Raw credit alert email. In Gmail, open the menu, choose Show original, then Copy to clipboard." />
        <button className="primary" disabled={action.busy || !raw.trim()}>
          {action.busy ? "Checking the signature" : "Add alert"}
        </button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && (
        <dl className="facts boxed">
          <dt>Bank</dt>
          <dd>{action.result.credit.bank.toUpperCase()}</dd>
          <dt>UTR</dt>
          <dd className="num">{utrGroups(action.result.credit.utr)}</dd>
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
