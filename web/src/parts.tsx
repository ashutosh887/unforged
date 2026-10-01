import { useCallback, useState } from "react"
import type { Credit, Decision, ScreenshotRead, Verdict } from "../../src/core/types.js"
import { formatPaise } from "../../src/core/money.js"
import { post, type RaceResult } from "./api"

export type Tone = "good" | "warn" | "bad" | "neutral"

export type BankRow = Pick<Credit, "bank" | "utr" | "amountPaise" | "dkimDomain" | "creditedAt">

export const verdicts: Record<Verdict, { label: string; tone: Tone }> = {
  VERIFIED: { label: "Verified", tone: "good" },
  ALREADY_CLAIMED: { label: "Already claimed", tone: "warn" },
  AMOUNT_MISMATCH: { label: "Amount mismatch", tone: "bad" },
  PAYEE_MISMATCH: { label: "Payee mismatch", tone: "bad" },
  NOT_FOUND_YET: { label: "Not found yet", tone: "neutral" },
  UNREADABLE: { label: "Unreadable", tone: "neutral" },
}

export function money(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? "—" : formatPaise(paise)
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

export function RawEmailField({ value, onChange, label }: { value: string; onChange: (raw: string) => void; label: string }) {
  const [over, setOver] = useState(false)
  const load = async (file: File | undefined) => {
    if (file) onChange(await file.text())
  }
  return (
    <label
      className={over ? "over" : ""}
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
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} spellCheck={false} placeholder="Paste here, or drop an .eml file" />
      <span className="file small">
        or open an .eml file <input type="file" accept=".eml,message/rfc822,text/plain" onChange={(e) => void load(e.target.files?.[0])} />
      </span>
    </label>
  )
}

export function BankFacts({ row, empty }: { row: BankRow | null | undefined; empty?: string }) {
  if (!row) return <p className="muted small">{empty ?? "No signed alert matches this UTR."}</p>
  return (
    <dl className="facts">
      <dt>Bank UTR</dt>
      <dd className="mono">{row.utr}</dd>
      <dt>Bank amount</dt>
      <dd>{money(row.amountPaise)}</dd>
      <dt>Signed by</dt>
      <dd>{row.dkimDomain}</dd>
    </dl>
  )
}

export type CardResult = Decision & { read?: ScreenshotRead; reader?: string }

function readerName(reader: string): string {
  if (reader === "textract") return "Amazon Textract"
  if (reader.includes("nova")) return "Amazon Nova (Bedrock)"
  if (reader.includes("claude")) return "Claude (Bedrock)"
  return reader
}

export function clockTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
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
  return (
    <article className={`verdict ${v.tone}`}>
      <h3>{v.label}</h3>
      {result.verdict === "ALREADY_CLAIMED" && result.priorClaim && (
        <p className="claimed">
          Already claimed · first claimed {clockTime(result.priorClaim.createdAt)} · order <span className="mono">{result.priorClaim.orderRef}</span>
        </p>
      )}
      <p>{result.reason}</p>
      <div className="compare">
        <div>
          <h4>Screenshot</h4>
          {result.read ? (
            <dl className="facts">
              <dt>UTR</dt>
              <dd className="mono">{result.read.utr ?? "—"}</dd>
              <dt>Amount</dt>
              <dd>{money(result.read.amountPaise)}</dd>
              <dt>Paid to</dt>
              <dd>{result.read.payeeVpa ?? "—"}</dd>
              {result.reader && (
                <>
                  <dt>Read by</dt>
                  <dd>{readerName(result.reader)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted small">No screenshot, alert claimed directly.</p>
          )}
        </div>
        <div>
          <h4>Bank alert</h4>
          <BankFacts row={result.credit ?? bankFallback} {...(bankEmpty ? { empty: bankEmpty } : {})} />
        </div>
      </div>
      <div className="release">
        {released ? (
          <p className="released">Released for order {orderRef ? <span className="mono">{orderRef}</span> : "this payment"}</p>
        ) : (
          <>
            <button type="button" disabled={!canRelease} title={canRelease ? "Mark this order released" : result.reason} onClick={() => setReleasedFor(result)}>
              Release goods
            </button>
            {!canRelease && <p className="muted small">Not releasable: {result.reason}</p>}
          </>
        )}
      </div>
    </article>
  )
}

export function Race() {
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
