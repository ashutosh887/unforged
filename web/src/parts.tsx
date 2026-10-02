import { useCallback, useState, type ReactNode } from "react"
import type { Credit, Decision, ScreenshotRead, Verdict } from "../../src/core/types.js"
import { formatPaise } from "../../src/core/money.js"
import { post, type RaceResult } from "./api"
import { Icon, type IconName } from "./Icon"

export type Tone = "good" | "warn" | "bad" | "neutral"

export type BankRow = Pick<Credit, "bank" | "utr" | "amountPaise" | "dkimDomain" | "creditedAt">

export const verdicts: Record<Verdict, { label: string; tone: Tone; next: string }> = {
  VERIFIED: { label: "Verified", tone: "good", next: "The signed alert matches. Release the goods." },
  ALREADY_CLAIMED: { label: "Already claimed", tone: "warn", next: "Don't release. It already paid for another order." },
  AMOUNT_MISMATCH: { label: "Amount mismatch", tone: "bad", next: "Don't release. Your bank received a different amount." },
  PAYEE_MISMATCH: { label: "Payee mismatch", tone: "bad", next: "Don't release. This payment went to a different UPI ID." },
  NOT_FOUND_YET: { label: "Not found yet", tone: "neutral", next: "No signed alert has this UTR yet. Wait for the bank's email." },
  UNREADABLE: { label: "Unreadable", tone: "neutral", next: "Ask for a clearer screenshot with the UTR and amount." },
}

export const toneIcon: Record<Tone, IconName> = { good: "check", warn: "replay", bad: "cross", neutral: "clock" }

export function money(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? "Not shown" : formatPaise(paise)
}

export function utrGroups(utr: string | null | undefined): string {
  if (!utr) return "Not shown"
  return /^\d{12}$/.test(utr) ? utr.replace(/(\d{4})(?=\d)/g, "$1 ") : utr
}

export function useAction<T>() {
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

export function RawEmailField({ value, onChange, label, hint }: { value: string; onChange: (raw: string) => void; label: string; hint?: string }) {
  const [over, setOver] = useState(false)
  const load = async (file: File | undefined) => {
    if (file) onChange(await file.text())
  }
  return (
    <label
      className={`field${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void load(e.dataTransfer.files[0])
      }}
    >
      <span className="field-label">{label}</span>
      {hint && <span className="field-hint">{hint}</span>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} spellCheck={false} placeholder="Paste here, or drop an .eml file" />
      <span className="file">
        Or open an .eml file <input type="file" accept=".eml,message/rfc822,text/plain" onChange={(e) => void load(e.target.files?.[0])} />
      </span>
    </label>
  )
}

export function BankFacts({ row, empty }: { row: BankRow | null | undefined; empty?: string }) {
  if (!row) return <p className="muted small">{empty ?? "No signed alert matches this UTR."}</p>
  return (
    <dl className="facts">
      <dt>Bank UTR</dt>
      <dd className="num">{utrGroups(row.utr)}</dd>
      <dt>Bank amount</dt>
      <dd>{money(row.amountPaise)}</dd>
      <dt>Signed by</dt>
      <dd>{row.dkimDomain}</dd>
    </dl>
  )
}

export type CardResult = Decision & { read?: ScreenshotRead; reader?: string }

export function readerName(reader: string): string {
  if (reader === "textract") return "Amazon Textract"
  if (reader.includes("nova")) return "Amazon Nova on Bedrock"
  if (reader.includes("claude")) return "Claude on Bedrock"
  return reader
}

export function clockTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

export function Panel({ tone, title, kicker, line, amount, children, action }: { tone: Tone; title: string; kicker?: ReactNode; line?: ReactNode; amount?: string | null; children?: ReactNode; action?: ReactNode }) {
  return (
    <article className={`panel ${tone}`}>
      <div className="panel-top">
        {kicker && <p className="panel-kicker">{kicker}</p>}
        <div className="panel-head">
          <span className="panel-mark">
            <Icon name={toneIcon[tone]} size={22} />
          </span>
          <h3>{title}</h3>
        </div>
        {amount && <p className="panel-amount">{amount}</p>}
        {line && <p className="panel-line">{line}</p>}
      </div>
      {children && <div className="panel-body">{children}</div>}
      {action && <div className="panel-action">{action}</div>}
    </article>
  )
}

export function ReleaseAction({ state, onRelease }: { state: { kind: "open" } | { kind: "done"; text: string } | { kind: "blocked"; reason: string }; onRelease?: () => void }) {
  if (state.kind === "done") {
    return (
      <p className="released" role="status">
        <Icon name="check" size={18} /> {state.text}
      </p>
    )
  }
  return (
    <button type="button" className="primary release-btn" disabled={state.kind === "blocked"} title={state.kind === "blocked" ? state.reason : "Mark this order released"} onClick={onRelease}>
      Release goods
    </button>
  )
}

function Cell({ value, off }: { value: string; off?: boolean }) {
  return <td className={off ? "off" : undefined}>{value}</td>
}

export function VerdictCard({
  result,
  orderRef,
  bankFallback,
  bankEmpty,
}: {
  result: CardResult
  orderRef?: string
  bankFallback?: BankRow | null
  bankEmpty?: string
}) {
  const v = verdicts[result.verdict]
  const [releasedFor, setReleasedFor] = useState<CardResult | null>(null)
  const canRelease = result.verdict === "VERIFIED"
  const released = canRelease && releasedFor === result
  const bank = result.credit ?? bankFallback ?? null
  const read = result.read
  const amount = bank?.amountPaise ?? read?.amountPaise ?? null
  const line =
    result.verdict === "ALREADY_CLAIMED" && result.priorClaim
      ? `First claimed for order ${result.priorClaim.orderRef} at ${clockTime(result.priorClaim.createdAt)}. ${v.next}`
      : v.next
  return (
    <Panel
      tone={v.tone}
      title={v.label}
      kicker={orderRef ? `Order ${orderRef}` : undefined}
      amount={amount === null ? null : money(amount)}
      line={line}
      action={
        <ReleaseAction
          state={released ? { kind: "done", text: `Released for order ${orderRef || "this payment"}` } : canRelease ? { kind: "open" } : { kind: "blocked", reason: result.reason }}
          onRelease={() => setReleasedFor(result)}
        />
      }
    >
      <p className="reason">{result.reason}</p>
      <table className="match">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Screenshot</th>
            <th scope="col">Bank alert</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">UTR</th>
            <Cell value={read ? utrGroups(read.utr) : "No screenshot"} />
            <Cell value={bank ? utrGroups(bank.utr) : "None"} />
          </tr>
          <tr>
            <th scope="row">Amount</th>
            <Cell value={read ? money(read.amountPaise) : "Not read"} off={result.verdict === "AMOUNT_MISMATCH"} />
            <Cell value={bank ? money(bank.amountPaise) : "No alert"} />
          </tr>
          <tr>
            <th scope="row">Paid to</th>
            <Cell value={read?.payeeVpa ?? "Not read"} off={result.verdict === "PAYEE_MISMATCH"} />
            <Cell value="Your UPI ID" />
          </tr>
          <tr>
            <th scope="row">Signed by</th>
            <Cell value={result.reader ? readerName(result.reader) : "Not read"} />
            <Cell value={bank?.dkimDomain ?? "No alert"} />
          </tr>
        </tbody>
      </table>
      {!bank && bankEmpty && <p className="muted small">{bankEmpty}</p>}
    </Panel>
  )
}

export function Race() {
  const action = useAction<RaceResult>()
  const n = 50
  return (
    <section className="sheet">
      <h2>Race 50 claims</h2>
      <p className="muted">50 claims for one credit at once, with the unique key and without.</p>
      <button type="button" className="secondary" disabled={action.busy} onClick={() => void action.run(() => post("race", { n }))}>
        {action.busy ? "Racing" : `Race ${n} claims`}
      </button>
      {action.error && <p className="error">{action.error}</p>}
      {action.result && (
        <div className="tallies">
          <div className={`tally ${action.result.guarded.verified === 1 ? "good" : "bad"}`}>
            <strong>{action.result.guarded.verified}</strong>
            <span>accepted with the unique index</span>
            <small>
              {action.result.guarded.alreadyClaimed} already claimed, {action.result.guarded.retries} retries, {action.result.guarded.ms} ms
            </small>
          </div>
          <div className={`tally ${action.result.naive.accepted === 1 ? "good" : "bad"}`}>
            <strong>{action.result.naive.accepted}</strong>
            <span>accepted by check-then-insert</span>
            <small>{action.result.naive.accepted > 1 ? `${action.result.naive.accepted - 1} double spends` : "No double spends"}</small>
          </div>
        </div>
      )}
    </section>
  )
}
