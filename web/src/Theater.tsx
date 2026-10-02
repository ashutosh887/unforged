import { useCallback, useEffect, useRef, useState } from "react"
import { post, type RaceResult, type RecordClaimResult, type VerifyResult } from "./api"
import { editOneCharacter } from "./Signature"
import { clockTime } from "./parts"

type Tone = "good" | "warn" | "bad" | "neutral"
type Step = { state: "waiting" } | { state: "running" } | { state: "done"; tone: Tone; stamp: string; detail: string; ms: number } | { state: "failed"; detail: string }

type Mail = { from: string; subject: string; date: string; domain: string; selector: string; lines: string[] }

const titles = [
  "Check the sender's signature",
  "Change one character and check again",
  "Claim it for refund 1042",
  "Claim the same email for refund 1043",
  "Fire 50 claims at one record at once",
]

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

function header(raw: string, name: string): string {
  const head = raw.slice(0, Math.max(0, raw.search(/\r?\n\r?\n/)))
  const m = head.match(new RegExp(`^${name}:([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im"))
  return m ? m[1]!.replace(/\r?\n[ \t]+/g, " ").trim() : ""
}

function parse(raw: string): Mail {
  const sig = header(raw, "DKIM-Signature")
  const start = raw.search(/\r?\n\r?\n/)
  const lines = raw
    .slice(start)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith("--") && !/^[\w-]+:/.test(l))
    .slice(0, 5)
  return {
    from: header(raw, "From").replace(/<[^>]*>/, "").replace(/"/g, "").trim() || header(raw, "From"),
    subject: header(raw, "Subject"),
    date: header(raw, "Date"),
    domain: sig.match(/\bd=([^;\s]+)/)?.[1] ?? "",
    selector: sig.match(/\bs=([^;\s]+)/)?.[1] ?? "",
    lines,
  }
}

function newLedger(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return id.toLowerCase()
}

async function loadSample(): Promise<string> {
  const res = await fetch("/samples/sample.eml", { cache: "no-cache" })
  if (!res.ok) throw new Error("The sample email is missing")
  return res.text()
}

async function timed<T>(task: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now()
  const value = await task()
  return { value, ms: Math.round(performance.now() - started) }
}

async function claim(raw: string, claimRef: string, ledger: string): Promise<RecordClaimResult> {
  const res = await fetch("/api/records/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw, claimRef, ledger }) })
  const data = (await res.json().catch(() => ({}))) as Partial<RecordClaimResult> & { error?: string }
  if (!data.verdict) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as RecordClaimResult
}

function claimStep(result: RecordClaimResult, ms: number): Step {
  if (result.verdict === "VERIFIED") return { state: "done", tone: "good", stamp: "Verified · claimed once", detail: `Claimed for ${result.claimRef} at ${clockTime(result.claimedAt)}. Release goods is open.`, ms }
  if (result.verdict === "ALREADY_CLAIMED") return { state: "done", tone: "warn", stamp: "Already claimed", detail: `First claimed for ${result.priorClaim.claimRef} at ${clockTime(result.priorClaim.createdAt)}. Release goods stays shut.`, ms }
  return { state: "done", tone: "bad", stamp: "Rejected", detail: result.reason, ms }
}

export function Theater() {
  const [raw, setRaw] = useState<string | null>(null)
  const [mail, setMail] = useState<Mail | null>(null)
  const [edit, setEdit] = useState<{ was: string; now: string; line: number; col: number } | null>(null)
  const [steps, setSteps] = useState<Step[]>(titles.map(() => ({ state: "waiting" })))
  const [race, setRace] = useState<RaceResult | null>(null)
  const [running, setRunning] = useState(false)
  const started = useRef(false)

  const set = (i: number, step: Step) => setSteps((all) => all.map((s, j) => (j === i ? step : s)))

  const run = useCallback(async () => {
    setRunning(true)
    setRace(null)
    setEdit(null)
    setSteps(titles.map(() => ({ state: "waiting" })))
    const beat = reducedMotion() ? 0 : 700
    try {
      const text: string = raw ?? (await loadSample())
      setRaw(text)
      const parsed = parse(text)
      setMail(parsed)
      await pause(beat)

      set(0, { state: "running" })
      const first = await timed(() => post<VerifyResult>("verify", { raw: text }))
      set(0, first.value.signer
        ? { state: "done", tone: "good", stamp: `Signed by ${first.value.signer}`, detail: `Fetched the public key at ${parsed.selector}._domainkey.${parsed.domain} from DNS and checked the signature over the headers and body.`, ms: first.ms }
        : { state: "done", tone: "bad", stamp: "Not verified", detail: first.value.signatures.find((s) => s.detail)?.detail ?? "No passing signature.", ms: first.ms })
      await pause(beat)

      const changed = editOneCharacter(text)
      if (!changed) throw new Error("No body text to change")
      const editedLines = parse(changed.raw).lines
      const line = editedLines.findIndex((l, i) => l !== parsed.lines[i])
      setEdit({ was: changed.was, now: changed.now, line, col: line >= 0 ? [...editedLines[line]!].findIndex((c, k) => c !== parsed.lines[line]![k]) : -1 })
      set(1, { state: "running" })
      await pause(beat)
      const second = await timed(() => post<VerifyResult>("verify", { raw: changed.raw }))
      set(1, second.value.signer
        ? { state: "done", tone: "warn", stamp: "Still signed", detail: "This sender signs only part of the body.", ms: second.ms }
        : { state: "done", tone: "bad", stamp: "Rejected", detail: `"${changed.was}" became "${changed.now}". ${second.value.signatures.find((s) => s.detail)?.detail ?? "The signature no longer verifies"}.`, ms: second.ms })
      await pause(beat)

      const ledger = newLedger()
      set(2, { state: "running" })
      const third = await timed(() => claim(text, "refund 1042", ledger))
      set(2, claimStep(third.value, third.ms))
      await pause(beat)

      set(3, { state: "running" })
      const fourth = await timed(() => claim(text, "refund 1043", ledger))
      set(3, claimStep(fourth.value, fourth.ms))
      await pause(beat)

      set(4, { state: "running" })
      const fifth = await timed(() => post<RaceResult>("race", { n: 50 }))
      setRace(fifth.value)
      set(4, {
        state: "done",
        tone: fifth.value.guarded.verified === 1 ? "good" : "bad",
        stamp: `${fifth.value.guarded.verified} of 50 accepted`,
        detail: `The unique index let one claim through and bounced ${fifth.value.guarded.alreadyClaimed}. The same 50 claims against a check-then-insert table were all accepted: ${fifth.value.naive.accepted - 1} double spends.`,
        ms: fifth.ms,
      })
    } catch (e) {
      setSteps((all) => {
        const i = all.findIndex((s) => s.state === "running" || s.state === "waiting")
        return all.map((s, j) => (j === i ? { state: "failed", detail: e instanceof Error ? e.message : String(e) } : s))
      })
    } finally {
      setRunning(false)
    }
  }, [raw])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  return (
    <section className="theater" aria-label="Live demonstration">
      <div className="theater-mail" aria-label="The signed email being checked">
        <div className="mail-head">
          <span className="mail-label">Email from</span>
          <strong>{mail?.from || "Loading a signed email"}</strong>
          {mail?.subject && <span className="mail-subject">{mail.subject}</span>}
        </div>
        {mail && (
          <p className="mail-sig">
            DKIM-Signature d=<b>{mail.domain}</b> s=<b>{mail.selector}</b>
          </p>
        )}
        <div className="mail-body">
          {(mail?.lines ?? []).map((l, i) => (
            <p key={i}>
              {edit && edit.line === i && edit.col >= 0 ? (
                <>
                  {l.slice(0, edit.col)}
                  <mark>{edit.now}</mark>
                  {l.slice(edit.col + 1)}
                </>
              ) : (
                l
              )}
            </p>
          ))}
        </div>
        <p className="mail-note">A real message from a public mailing-list archive, signed by its sender's mail server. Each visit gets its own ledger.</p>
      </div>

      <ol className="theater-steps">
        {titles.map((title, i) => {
          const s = steps[i]!
          return (
            <li key={title} className={`tstep ${s.state} ${s.state === "done" ? s.tone : ""}`}>
              <span className="tstep-title">{title}</span>
              {s.state === "running" && <span className="tstep-live">Calling the live API</span>}
              {s.state === "done" && (
                <>
                  <span className={`tstamp ${s.tone}`}>{s.stamp}</span>
                  <span className="tstep-detail">
                    {s.detail} <span className="tstep-ms">{s.ms} ms</span>
                  </span>
                </>
              )}
              {s.state === "failed" && <span className="tstep-detail error">{s.detail}</span>}
              {i === 4 && race && <RaceGrid race={race} />}
            </li>
          )
        })}
      </ol>

      <div className="theater-foot">
        <button type="button" onClick={() => void run()} disabled={running}>
          {running ? "Running on the live stack" : "Run it again"}
        </button>
        <a className="ghost-link" href="#own">
          Try it with your own email
        </a>
      </div>
    </section>
  )
}

function RaceGrid({ race }: { race: RaceResult }) {
  const guarded = Array.from({ length: race.n }, (_, i) => (i < race.guarded.verified ? "win" : i < race.guarded.verified + race.guarded.alreadyClaimed ? "bounce" : "err"))
  const naive = Array.from({ length: race.n }, (_, i) => (i < race.naive.accepted ? (i === 0 ? "win" : "double") : "bounce"))
  return (
    <div className="race-grid">
      <div className="lane">
        <span className="lane-label">With the unique index</span>
        <div className="cells">
          {guarded.map((c, i) => (
            <i key={i} className={`cell ${c}`} style={{ animationDelay: `${i * 18}ms` }} />
          ))}
        </div>
      </div>
      <div className="lane">
        <span className="lane-label">Check, then insert</span>
        <div className="cells">
          {naive.map((c, i) => (
            <i key={i} className={`cell ${c}`} style={{ animationDelay: `${i * 18}ms` }} />
          ))}
        </div>
      </div>
      <p className="lane-key">
        <i className="cell win" /> approved once <i className="cell bounce" /> bounced as already claimed <i className="cell double" /> approved again, a double spend
      </p>
    </div>
  )
}
