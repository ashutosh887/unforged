import { useEffect, useRef, useState } from "react"
import type { ScreenshotRead, Verdict } from "../../src/core/types.js"
import { money, verdicts } from "./parts"

type FieldBox = { field: "utr" | "amount" | "payee"; text: string; left: number; top: number; width: number; height: number }
type ReadResult = { read: ScreenshotRead; reader: string; boxes: FieldBox[]; ms: number }
type Shot = { file: string; label: string }
type State = { state: "waiting" } | { state: "reading" } | { state: "done"; result: ReadResult } | { state: "failed"; message: string }

const shots: Shot[] = [
  { file: "/samples/upi-paid.png", label: "As the buyer's app showed it" },
  { file: "/samples/upi-edited.png", label: "The same screenshot, amount edited" },
]

const fieldNames: Record<FieldBox["field"], string> = { utr: "UTR", amount: "Amount", payee: "Paid to" }
const order: Verdict[] = ["VERIFIED", "ALREADY_CLAIMED", "AMOUNT_MISMATCH", "PAYEE_MISMATCH", "NOT_FOUND_YET", "UNREADABLE"]

async function base64Of(file: string): Promise<string> {
  const blob = await fetch(file, { cache: "no-cache" }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Sample screenshot missing"))))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function readShot(file: string): Promise<ReadResult> {
  const res = await fetch("/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: await base64Of(file) }) })
  const data = (await res.json().catch(() => ({}))) as Partial<ReadResult> & { error?: string }
  if (!res.ok || !data.read) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as ReadResult
}

export function UpiCase({ onShop }: { onShop: () => void }) {
  const [states, setStates] = useState<State[]>(shots.map(() => ({ state: "waiting" })))
  const ref = useRef<HTMLElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const run = async () => {
      if (started.current) return
      started.current = true
      for (const [i, shot] of shots.entries()) {
        setStates((all) => all.map((s, j) => (j === i ? { state: "reading" } : s)))
        try {
          const result = await readShot(shot.file)
          setStates((all) => all.map((s, j) => (j === i ? { state: "done", result } : s)))
        } catch (e) {
          setStates((all) => all.map((s, j) => (j === i ? { state: "failed", message: e instanceof Error ? e.message : String(e) } : s)))
        }
      }
    }
    if (typeof IntersectionObserver === "undefined") {
      void run()
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect()
        void run()
      }
    }, { threshold: 0.25 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const paid = states[0]?.state === "done" ? states[0].result.read : null
  const edited = states[1]?.state === "done" ? states[1].result.read : null

  return (
    <section className="upi-case" ref={ref} aria-labelledby="upi-title">
      <h2 id="upi-title">The first case: a UPI screenshot at the counter</h2>
      <p className="muted">
        Two sample screenshots made for this demo. Amazon Textract reads each one live, and code picks out the UTR, the amount and the UPI ID it was paid to. The boxes are
        where Textract found them.
      </p>
      <div className="upi-shots">
        {shots.map((shot, i) => (
          <ShotCard key={shot.file} shot={shot} state={states[i]!} />
        ))}
      </div>
      <div className="upi-next">
        <p>
          {paid && edited && paid.utr === edited.utr && paid.amountPaise !== edited.amountPaise ? (
            <>
              Both screenshots carry UTR <span className="mono">{paid.utr}</span>, but one says {money(paid.amountPaise)} and the other {money(edited.amountPaise)}. A photo
              editor can do that in a minute. Only the bank's signed alert for that UTR says which amount arrived.
            </>
          ) : (
            <>Both screenshots carry the same UTR with different amounts. Only the bank's signed alert for that UTR says which amount arrived.</>
          )}
        </p>
        <p>
          With the seller's signed alert stored, the edited copy comes back amount mismatch, and the real one comes back verified once and already claimed after that. This
          public page has no seller's bank alert, so that step runs in your own shop.
        </p>
        <ul className="upi-verdicts" aria-label="The six verdicts">
          {order.map((v) => (
            <li key={v} className={`pill ${verdicts[v].tone}`}>
              {verdicts[v].label}
            </li>
          ))}
        </ul>
        <button type="button" className="ghost" onClick={onShop}>
          Set up your shop
        </button>
      </div>
    </section>
  )
}

function ShotCard({ shot, state }: { shot: Shot; state: State }) {
  const result = state.state === "done" ? state.result : null
  return (
    <figure className="upi-shot">
      <figcaption>{shot.label}</figcaption>
      <div className="upi-frame">
        <img src={shot.file} alt={`${shot.label}, a sample screenshot made for this demo`} />
        {result?.boxes.map((b) => (
          <span
            key={b.field}
            className={`upi-box ${b.field}`}
            style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
          >
            <b>{fieldNames[b.field]}</b>
          </span>
        ))}
      </div>
      {state.state === "waiting" && <p className="muted small">Reads when this section scrolls into view.</p>}
      {state.state === "reading" && <p className="tstep-live">Amazon Textract is reading it</p>}
      {state.state === "failed" && <p className="error">{state.message}</p>}
      {result && (
        <dl className="facts">
          <dt>UTR</dt>
          <dd className="mono">{result.read.utr ?? "not found"}</dd>
          <dt>Amount</dt>
          <dd>{money(result.read.amountPaise)}</dd>
          <dt>Paid to</dt>
          <dd>{result.read.payeeVpa ?? "not found"}</dd>
          <dt>Read in</dt>
          <dd>{result.ms} ms by Amazon Textract</dd>
        </dl>
      )}
    </figure>
  )
}
