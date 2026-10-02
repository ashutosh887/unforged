import { useEffect, useState } from "react"
import type { Verdict } from "../../src/core/types.js"
import { encodeImage, post, type AlertResult, type CheckResult } from "./api"
import { money, verdicts, VerdictCard, type BankRow } from "./parts"

type FixtureCheck = { label: string; file: string; expect: Verdict; order: string; beforeAlert?: boolean }
type Manifest = { published?: boolean; shop: { name: string; vpa: string }; alert: { label: string; file: string }; checks: FixtureCheck[] }

type Loaded<T> = { state: "loading" } | { state: "pending" } | { state: "ready"; data: T }

type Step =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "skipped"; why: string }
  | { state: "running" }
  | { state: "error"; message: string }
  | { state: "done"; result: CheckResult }

type AlertStep = { state: "idle" } | { state: "pending" } | { state: "running" } | { state: "error"; message: string } | { state: "done"; result: AlertResult }

const fixtureRoot = "/fixtures/"
const imageTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }

async function fetchFixture(file: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${fixtureRoot}${file}`, { cache: "no-cache" })
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null
    return await res.blob()
  } catch {
    return null
  }
}

function asImage(blob: Blob, file: string): File {
  const ext = file.split(".").pop()?.toLowerCase() ?? ""
  const type = blob.type.startsWith("image/") ? blob.type : (imageTypes[ext] ?? "image/png")
  return new File([blob], file, { type })
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function useManifest(): Loaded<Manifest> {
  const [manifest, setManifest] = useState<Loaded<Manifest>>({ state: "loading" })
  useEffect(() => {
    let live = true
    void fetchFixture("manifest.json").then(async (blob) => {
      if (!live) return
      if (!blob) return setManifest({ state: "pending" })
      try {
        setManifest({ state: "ready", data: JSON.parse(await blob.text()) as Manifest })
      } catch {
        setManifest({ state: "pending" })
      }
    })
    return () => {
      live = false
    }
  }, [])
  return manifest
}

function useFiles(manifest: Manifest | null): Record<string, Blob | null> | null {
  const [files, setFiles] = useState<Record<string, Blob | null> | null>(null)
  useEffect(() => {
    if (!manifest) return
    let live = true
    const names = [...new Set([manifest.alert.file, ...manifest.checks.map((c) => c.file)])]
    void Promise.all(names.map(async (name) => [name, await fetchFixture(name)] as const)).then((entries) => {
      if (live) setFiles(Object.fromEntries(entries))
    })
    return () => {
      live = false
    }
  }, [manifest])
  return files
}

function usePreviews(files: Record<string, Blob | null> | null): Record<string, string> {
  const [previews, setPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!files) return
    const urls = Object.fromEntries(
      Object.entries(files).flatMap(([name, blob]) => (blob && !name.endsWith(".eml") ? [[name, URL.createObjectURL(blob)] as const] : [])),
    )
    setPreviews(urls)
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
  }, [files])
  return previews
}

export function Demo() {
  const manifest = useManifest()
  const ready = manifest.state === "ready" && manifest.data.published ? manifest.data : null
  const files = useFiles(ready)
  const previews = usePreviews(files)
  const [alertStep, setAlertStep] = useState<AlertStep>({ state: "idle" })
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [elapsed, setElapsed] = useState<number | null>(null)

  const run = async () => {
    if (!ready || !files) return
    const alertRaw = files[ready.alert.file]
    const setStep = (i: number, step: Step) => setSteps((all) => all.map((s, j) => (j === i ? step : s)))
    setRunning(true)
    setError("")
    setElapsed(null)
    setAlertStep(alertRaw ? { state: "idle" } : { state: "pending" })
    setSteps(ready.checks.map((c) => (files[c.file] ? { state: "idle" } : { state: "pending" })))
    const started = performance.now()

    const check = async (i: number, token: string) => {
      const fixture = ready.checks[i]!
      const blob = files[fixture.file]
      if (!blob) return
      setStep(i, { state: "running" })
      try {
        const result = await post<CheckResult>("check", { ...(await encodeImage(asImage(blob, fixture.file))), orderRef: fixture.order }, token)
        setStep(i, { state: "done", result })
      } catch (e) {
        setStep(i, { state: "error", message: errorText(e) })
      }
    }
    const indexes = (keep: (c: FixtureCheck) => boolean) => ready.checks.flatMap((c, i) => (keep(c) ? [i] : []))

    try {
      const { token } = await post<{ shopId: string; token: string }>("shops", { name: ready.shop.name, vpas: [ready.shop.vpa] })
      await Promise.all(indexes((c) => c.beforeAlert === true).map((i) => check(i, token)))

      let stored = false
      if (alertRaw) {
        setAlertStep({ state: "running" })
        try {
          const result = await post<AlertResult>("alerts", { raw: await alertRaw.text() }, token)
          setAlertStep({ state: "done", result })
          stored = true
        } catch (e) {
          setAlertStep({ state: "error", message: errorText(e) })
        }
      }

      const afterAlert = indexes((c) => c.beforeAlert !== true)
      if (!stored) {
        afterAlert.filter((i) => files[ready.checks[i]!.file]).forEach((i) => setStep(i, { state: "skipped", why: "Needs the signed alert stored first." }))
      } else {
        const reuse = new Set(indexes((c) => c.expect === "ALREADY_CLAIMED"))
        await Promise.all(afterAlert.filter((i) => !reuse.has(i)).map((i) => check(i, token)))
        for (const i of afterAlert.filter((i) => reuse.has(i))) await check(i, token)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setElapsed(Math.round((performance.now() - started) / 100) / 10)
      setRunning(false)
    }
  }

  if (manifest.state === "loading") return null
  if (!ready) return null

  if (files === null) return null

  const storedAlert: BankRow | null = alertStep.state === "done" ? alertStep.result.credit : null
  const alertMissing = !files[ready.alert.file]
  const nothingPublished = alertMissing && ready.checks.every((c) => !files[c.file])

  if (nothingPublished) return null

  return (
    <>
      <section className="sheet">
        <h2>Six cases</h2>
        <p className="muted">
          No bank account needed. One tap creates a demo shop paid on <span className="num">{ready.shop.vpa}</span>, checks the real screenshot before and after its signed bank alert
          arrives, then runs the edited and reused copies. Every verdict below comes from the live API.
        </p>
        <button type="button" className="primary" onClick={() => void run()} disabled={running}>
          {running ? "Running" : steps.length ? "Run again" : "Run every case"}
        </button>
        {elapsed !== null && !running && <p className="muted small">Finished in {elapsed} s.</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="sheet">
        <h2>{ready.alert.label}</h2>
        {alertMissing || alertStep.state === "pending" ? (
          <p className="muted">Fixture pending.</p>
        ) : alertStep.state === "done" ? (
          <>
            <p className="muted small">DKIM signature passed. Stored as the shop's bank record.</p>
            <dl className="facts">
              <dt>Bank</dt>
              <dd>{alertStep.result.credit.bank.toUpperCase()}</dd>
              <dt>UTR</dt>
              <dd className="num">{alertStep.result.credit.utr}</dd>
              <dt>Amount</dt>
              <dd>{money(alertStep.result.credit.amountPaise)}</dd>
              <dt>Signed by</dt>
              <dd>{alertStep.result.credit.dkimDomain}</dd>
            </dl>
          </>
        ) : alertStep.state === "error" ? (
          <p className="error">{alertStep.message}</p>
        ) : (
          <p className="muted">{alertStep.state === "running" ? "Checking the signature" : "Posted after the first check, so the screenshot is seen once before the bank record exists."}</p>
        )}
      </section>

      <ol className="cases">
        {ready.checks.map((fixture, i) => (
          <Case key={`${fixture.order}-${i}`} fixture={fixture} step={steps[i] ?? (!files[fixture.file] ? { state: "pending" } : { state: "idle" })} preview={previews[fixture.file]} storedAlert={storedAlert} />
        ))}
      </ol>
    </>
  )
}

function Case({ fixture, step, preview, storedAlert }: { fixture: FixtureCheck; step: Step; preview: string | undefined; storedAlert: BankRow | null }) {
  const expected = verdicts[fixture.expect]
  const matched = step.state === "done" ? step.result.verdict === fixture.expect : null
  return (
    <li className="sheet case">
      <div className="case-head">
        {preview ? <img src={preview} alt={fixture.label} /> : <div className="thumb-empty">No image</div>}
        <div>
          <h3>{fixture.label}</h3>
          <p className="muted small">
            Order <span className="num">{fixture.order}</span>, expects {expected.label}
            {matched !== null && <strong className={matched ? "match" : "miss"}>{matched ? ", matches" : ", differs"}</strong>}
          </p>
        </div>
      </div>
      {step.state === "pending" && <p className="muted">Fixture pending.</p>}
      {step.state === "skipped" && <p className="muted">{step.why}</p>}
      {step.state === "running" && <p className="muted">Reading the screenshot</p>}
      {step.state === "error" && <p className="error">{step.message}</p>}
      {step.state === "done" && (
        <VerdictCard
          result={step.result}
          orderRef={fixture.order}
          bankFallback={fixture.beforeAlert ? null : storedAlert}
          bankEmpty={fixture.beforeAlert ? "No alert has reached the shop yet." : "No signed alert matches this UTR."}
        />
      )}
    </li>
  )
}
