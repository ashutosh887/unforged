import { useState } from "react"
import { encodeImage, post, type CheckResult } from "./api"
import { verdicts } from "./parts"
import { Section } from "./Site"

type Sample = { file: string; label: string; order: string }
type Row = { state: "queued" } | { state: "running" } | { state: "done"; result: CheckResult } | { state: "failed"; message: string }

const samples: Sample[] = [
  { file: "/samples/upi-paid.png", label: "As the app showed it", order: "A21" },
  { file: "/samples/upi-edited.png", label: "Amount edited", order: "A22" },
  { file: "/samples/upi-payee.png", label: "Paid to someone else", order: "A23" },
  { file: "/samples/upi-cropped.png", label: "Cropped, no UTR", order: "A24" },
]

async function asFile(path: string): Promise<File> {
  const res = await fetch(path, { cache: "no-cache" })
  if (!res.ok) throw new Error("Sample missing")
  return new File([await res.blob()], path.split("/").pop()!, { type: "image/png" })
}

export function DemoChecks() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState("")
  const running = rows?.some((r) => r.state === "queued" || r.state === "running") ?? false

  const run = async () => {
    setError("")
    setRows(samples.map(() => ({ state: "queued" })))
    const set = (i: number, row: Row) => setRows((all) => all && all.map((r, j) => (j === i ? row : r)))
    try {
      const { token } = await post<{ token: string }>("demo/shop", {})
      await Promise.all(
        samples.map(async (s, i) => {
          set(i, { state: "running" })
          try {
            const result = await post<CheckResult>("check", { ...(await encodeImage(await asFile(s.file))), orderRef: s.order }, token)
            set(i, { state: "done", result })
          } catch (e) {
            set(i, { state: "failed", message: e instanceof Error ? e.message : String(e) })
          }
        }),
      )
    } catch (e) {
      setRows(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Section title="Run the real check" sub="Opens a throwaway demo shop with no bank alert, then sends four screenshots through POST /api/check.">
      <div className="demo-checks">
        <button type="button" className="primary" onClick={() => void run()} disabled={running}>
          {running ? "Checking" : rows ? "Run again" : "Check 4 screenshots"}
        </button>
        {error && <p className="error">{error}</p>}
        <ul className="demo-rows">
          {samples.map((s, i) => {
            const row = rows?.[i]
            const v = row?.state === "done" ? verdicts[row.result.verdict] : null
            return (
              <li key={s.file} className="demo-row">
                <img src={s.file} alt="" width={44} height={60} />
                <span className="demo-name">
                  <strong>{s.label}</strong>
                  <span className="muted small">
                    {row?.state === "done" ? row.result.reason : row?.state === "failed" ? row.message : row?.state === "running" ? "Reading and checking" : `Order ${s.order}`}
                  </span>
                </span>
                {v ? <span className={`chip ${v.tone}`}>{v.label}</span> : <span className="chip-wait muted small">{row ? "Waiting" : ""}</span>}
              </li>
            )
          })}
        </ul>
        <p className="muted small">With no bank alert stored, readable screenshots come back Not found yet. Amount and payee mismatch need a real signed alert in your shop.</p>
      </div>
    </Section>
  )
}
