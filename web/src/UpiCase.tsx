import { useEffect, useRef, useState } from "react"
import type { Verdict } from "../../src/core/types.js"
import { call, type ReadResult } from "./api"
import { ShotFrame } from "./Check"
import { money, utrGroups, verdicts } from "./parts"
import { hrefOf } from "./router"
import { DemoChecks } from "./DemoChecks"
import { PageHead, Section } from "./Site"

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
  const res = await call("read", { image: await base64Of(file) })
  const data = (await res.json().catch(() => ({}))) as Partial<ReadResult> & { error?: string }
  if (!res.ok || !data.read) throw new Error(data.error ?? `The server answered with status ${res.status}. Try again.`)
  return data as ReadResult
}

export function UpiCase() {
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
    <section className="upi-case" ref={ref}>
      <PageHead title="Two screenshots, one UTR" sub="Amazon Textract reads both live. The boxes show where it found each field. Only the bank's signed alert knows which amount arrived." />
      <div className="upi-shots">
        {shots.map((shot, i) => (
          <ShotCard key={shot.file} shot={shot} state={states[i]!} />
        ))}
      </div>
      <p className="upi-punch" aria-live="polite">
        {paid && edited && paid.utr === edited.utr && paid.amountPaise !== edited.amountPaise ? (
          <>
            Same UTR <span className="num">{utrGroups(paid.utr)}</span>. {money(paid.amountPaise)} on one, {money(edited.amountPaise)} on the other.
          </>
        ) : (
          <>Same UTR, two amounts.</>
        )}
      </p>
      <DemoChecks />
      <Section title="Six verdicts" sub="Code returns one, in this order, with its reason. There is no fraud score.">
        <ol className="upi-verdicts">
          {order.map((v) => (
            <li key={v} className={`upi-verdict ${verdicts[v].tone}`}>
              <span className={`chip ${verdicts[v].tone}`}>{verdicts[v].label}</span>
              <span>{verdicts[v].next}</span>
            </li>
          ))}
        </ol>
        <p>
          <a className="secondary" href={`${hrefOf.shop}/setup`}>
            Set up your shop
          </a>
        </p>
      </Section>
    </section>
  )
}

function ShotCard({ shot, state }: { shot: Shot; state: State }) {
  const result = state.state === "done" ? state.result : null
  return (
    <figure className="upi-shot">
      <figcaption>{shot.label}</figcaption>
      <ShotFrame src={shot.file} boxes={result?.boxes ?? []} scanning={state.state === "reading"} alt={`${shot.label}, a sample screenshot made for this demo`} />
      {state.state === "waiting" && <p className="muted small">Queued</p>}
      {state.state === "reading" && <p className="live-note">Textract is reading it</p>}
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
