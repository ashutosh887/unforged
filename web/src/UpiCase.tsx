import { useEffect, useRef, useState } from "react"
import type { Verdict } from "../../src/core/types.js"
import type { ReadResult } from "./api"
import { ShotFrame } from "./Check"
import { money, utrGroups, verdicts } from "./parts"

type Shot = { file: string; label: string }
type State = { state: "waiting" } | { state: "reading" } | { state: "done"; result: ReadResult } | { state: "failed"; message: string }

const shots: Shot[] = [
  { file: "/samples/upi-paid.png", label: "As the app showed it" },
  { file: "/samples/upi-edited.png", label: "Amount edited" },
]

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
  if (!res.ok || !data.read) throw new Error(data.error ?? `The server answered with status ${res.status}. Try again.`)
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
      <div className="band-head">
        <h2 id="upi-title">Two screenshots, one UTR</h2>
        <p className="muted">
          Both were made for this demo. Amazon Textract reads each one live when you reach this part of the page, and code picks out the UTR, the amount and the UPI ID. The boxes show where
          Textract found them.
        </p>
      </div>
      <div className="upi-shots">
        {shots.map((shot, i) => (
          <ShotCard key={shot.file} shot={shot} state={states[i]!} />
        ))}
      </div>
      <div className="upi-next">
        <p className="upi-punch">
          {paid && edited && paid.utr === edited.utr && paid.amountPaise !== edited.amountPaise ? (
            <>
              Same UTR <span className="num">{utrGroups(paid.utr)}</span>. One says {money(paid.amountPaise)}, the other {money(edited.amountPaise)}. Only the bank's signed alert says which
              amount arrived.
            </>
          ) : (
            <>Both screenshots carry the same UTR with different amounts. Only the bank's signed alert says which amount arrived.</>
          )}
        </p>
        <p className="muted">
          With your bank's alert stored, the edited copy comes back amount mismatch. The real one comes back verified once, and already claimed every time after that. This page has no
          seller's bank alert, so that part runs in your own shop.
        </p>
        <dl className="upi-verdicts">
          {order.map((v) => (
            <div key={v} className={`upi-verdict ${verdicts[v].tone}`}>
              <dt>{verdicts[v].label}</dt>
              <dd>{verdicts[v].next}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="secondary" onClick={onShop}>
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
      <ShotFrame src={shot.file} boxes={result?.boxes ?? []} scanning={state.state === "reading"} alt={`${shot.label}, a sample screenshot made for this demo`} />
      {state.state === "waiting" && <p className="muted small">Reads when this part scrolls into view.</p>}
      {state.state === "reading" && <p className="lstep-live">Amazon Textract is reading it</p>}
      {state.state === "failed" && <p className="error">{state.message}</p>}
      {result && (
        <dl className="facts">
          <dt>UTR</dt>
          <dd className="num">{result.read.utr ? utrGroups(result.read.utr) : "Not found"}</dd>
          <dt>Amount</dt>
          <dd>{money(result.read.amountPaise)}</dd>
          <dt>Paid to</dt>
          <dd>{result.read.payeeVpa ?? "Not found"}</dd>
          <dt>Read in</dt>
          <dd>{result.ms} ms</dd>
        </dl>
      )}
    </figure>
  )
}
