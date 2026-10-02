import { useEffect, useState, type DragEvent, type FormEvent } from "react"
import { encodeImage, post, type AlertResult, type CheckResult, type FieldBox, type ReadResult } from "./api"
import { Icon } from "./Icon"
import { money, RawEmailField, readerName, useAction, utrGroups, VerdictCard } from "./parts"

type Mode = "screenshot" | "alert"
type Phase = { state: "idle" } | { state: "reading" } | { state: "read"; read: ReadResult } | { state: "checking"; read: ReadResult } | { state: "verdict"; read: ReadResult; result: CheckResult; order: string } | { state: "error"; message: string; read?: ReadResult }

const samples = [
  { file: "/samples/upi-paid.png", label: "Real sample" },
  { file: "/samples/upi-edited.png", label: "Amount edited" },
]

const fieldNames: Record<FieldBox["field"], string> = { utr: "UTR", amount: "Amount", payee: "Paid to" }

async function readScreenshot(file: File): Promise<ReadResult> {
  const { image } = await encodeImage(file, ["png", "jpeg"])
  const res = await fetch("/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) })
  const data = (await res.json().catch(() => ({}))) as Partial<ReadResult> & { error?: string }
  if (!res.ok || !data.read) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as ReadResult
}

export function CheckScreen({ token, onDone, onShop }: { token: string; onDone: () => void; onShop: () => void }) {
  const [mode, setMode] = useState<Mode>("screenshot")
  return (
    <div className="check">
      {token && (
        <div className="segmented" role="group" aria-label="What to check">
          <button type="button" aria-pressed={mode === "screenshot"} onClick={() => setMode("screenshot")}>
            Screenshot
          </button>
          <button type="button" aria-pressed={mode === "alert"} onClick={() => setMode("alert")}>
            Bank alert only
          </button>
        </div>
      )}
      {mode === "screenshot" ? <ScreenshotCheck token={token} onDone={onDone} onShop={onShop} /> : <ClaimAlertBox token={token} onDone={onDone} />}
    </div>
  )
}

function ScreenshotCheck({ token, onDone, onShop }: { token: string; onDone: () => void; onShop: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [orderRef, setOrderRef] = useState("")
  const [over, setOver] = useState(false)
  const [phase, setPhase] = useState<Phase>({ state: "idle" })

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const choose = (f: File | null | undefined) => {
    if (!f?.type.startsWith("image/")) return
    setFile(f)
    setPhase({ state: "idle" })
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    choose(e.dataTransfer.files[0])
  }

  const check = async (f: File, order: string) => {
    setPhase({ state: "reading" })
    let read: ReadResult | undefined
    try {
      read = await readScreenshot(f)
      if (!token) return setPhase({ state: "read", read })
      setPhase({ state: "checking", read })
      const result = await post<CheckResult>("check", { ...(await encodeImage(f)), orderRef: order }, token).finally(onDone)
      setPhase({ state: "verdict", read, result, order })
    } catch (e) {
      setPhase({ state: "error", message: e instanceof Error ? e.message : String(e), ...(read ? { read } : {}) })
    }
  }

  const useSample = async (path: string) => {
    const blob = await fetch(path, { cache: "no-cache" }).then((r) => (r.ok ? r.blob() : null)).catch(() => null)
    if (!blob) return setPhase({ state: "error", message: "The sample screenshot is missing." })
    const f = new File([blob], path.split("/").pop()!, { type: "image/png" })
    setFile(f)
    if (!token) void check(f, "")
    else setPhase({ state: "idle" })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (file) void check(file, orderRef)
  }

  const busy = phase.state === "reading" || phase.state === "checking"
  const read = "read" in phase ? phase.read : undefined

  return (
    <>
      <form onSubmit={submit} className="check-form">
        <label
          className={`shot-drop${over ? " over" : ""}${preview ? " filled" : ""}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <input type="file" accept="image/*" onChange={(e) => choose(e.target.files?.[0])} />
          {preview ? (
            <ShotFrame src={preview} boxes={read?.boxes ?? []} scanning={phase.state === "reading"} />
          ) : (
            <span className="shot-empty">
              <Icon name="image" size={28} />
              <strong>Choose the buyer's screenshot</strong>
              <span>Or drop it here. PNG or JPEG, under 4 MB.</span>
            </span>
          )}
        </label>
        <div className="samples">
          <span className="muted small">No screenshot handy?</span>
          {samples.map((s) => (
            <button key={s.file} type="button" className="chip-btn" disabled={busy} onClick={() => void useSample(s.file)}>
              {s.label}
            </button>
          ))}
        </div>
        {token && (
          <label className="field">
            <span className="field-label">Order it pays for</span>
            <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="A1042" maxLength={80} required />
          </label>
        )}
        <button className="primary big" disabled={busy || !file || (Boolean(token) && !orderRef.trim())}>
          {phase.state === "reading" ? "Reading the screenshot" : phase.state === "checking" ? "Matching the bank alert" : token ? "Check payment" : "Read the screenshot"}
        </button>
      </form>

      {read && <ReadSheet read={read} />}
      {phase.state === "error" && <p className="error">{phase.message}</p>}
      {phase.state === "verdict" && <VerdictCard result={phase.result} orderRef={phase.order} />}
      {phase.state === "read" && !token && (
        <div className="notice">
          <p>
            <strong>No verdict on the demo counter.</strong> A verdict compares this UTR with your shop's signed bank alerts, and the demo has none. Set up a shop and add your bank's alert to
            get one.
          </p>
          <button type="button" className="secondary" onClick={onShop}>
            Set up your shop
          </button>
        </div>
      )}
    </>
  )
}

export function ShotFrame({ src, boxes, scanning, alt = "The screenshot being checked" }: { src: string; boxes: FieldBox[]; scanning?: boolean; alt?: string }) {
  return (
    <span className={`shot-frame${scanning ? " scanning" : ""}`}>
      <img src={src} alt={alt} />
      {boxes.map((b) => (
        <span key={b.field} className={`shot-box ${b.field}`} style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}>
          <b>{fieldNames[b.field]}</b>
        </span>
      ))}
    </span>
  )
}

export function ReadSheet({ read }: { read: ReadResult }) {
  return (
    <section className="readsheet" aria-label="What the screenshot says">
      <p className="readsheet-head">
        Read by {readerName(read.reader)} in {read.ms} ms
      </p>
      <p className="readsheet-amount">{money(read.read.amountPaise)}</p>
      <dl className="facts">
        <dt>UTR</dt>
        <dd className="num">{read.read.utr ? utrGroups(read.read.utr) : "Not found"}</dd>
        <dt>Paid to</dt>
        <dd>{read.read.payeeVpa ?? "Not found"}</dd>
      </dl>
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
    <>
      <form onSubmit={submit} className="check-form">
        <p className="muted small">No screenshot. Paste the bank's signed credit alert and the order it pays for. Each alert can back one order.</p>
        <RawEmailField value={raw} onChange={setRaw} label="Raw credit alert email. In Gmail, open the menu, choose Show original, then Copy to clipboard." />
        <label className="field">
          <span className="field-label">Order it pays for</span>
          <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="A1042" maxLength={80} required />
        </label>
        <button className="primary big" disabled={action.busy || !raw.trim() || !orderRef.trim()}>
          {action.busy ? "Checking the signature" : "Claim alert"}
        </button>
      </form>
      {action.error && <p className="error">{action.error}</p>}
      {action.result &&
        (action.result.decision ? (
          <VerdictCard result={action.result.decision} orderRef={submitted} bankFallback={action.result.credit} />
        ) : (
          <p className="muted small">Alert stored. The server sent back no claim decision.</p>
        ))}
    </>
  )
}
