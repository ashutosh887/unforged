import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"
import { post, type RaceResult, type ReceiptLink, type ReceiptResult, type RecordClaimResult, type VerifyResult } from "./api"
import { clockTime } from "./parts"
import { bodyHash, editAt, firstEditable, readMail, type SignedMail } from "./proof"

type Tone = "good" | "warn" | "bad"
type Step = { state: "waiting" } | { state: "running" } | { state: "done"; tone: Tone; stamp: string; ms: number } | { state: "failed"; detail: string }
type Edit = { line: number; col: number; was: string; now: string; raw: string; hash: string | null; result: VerifyResult | null; checking: boolean }
type Claimed = { result: RecordClaimResult; ms: number }
type Released = { at: string } | null
type GateState = "queued" | "pressing" | "settled"

const titles = ["Check the signature", "Change one character", "Fire 50 claims at once", "Claim it for order A12", "Show it again for A13", "Sign the buyer's receipt"]

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

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

function claimTone(result: RecordClaimResult): Tone {
  return result.verdict === "VERIFIED" ? "good" : result.verdict === "ALREADY_CLAIMED" ? "warn" : "bad"
}

function claimStamp(result: RecordClaimResult): string {
  return result.verdict === "VERIFIED" ? "Claimed once" : result.verdict === "ALREADY_CLAIMED" ? "Already claimed" : "Rejected"
}

function failure(result: VerifyResult): string {
  return result.signatures.find((s) => s.detail)?.detail ?? "No passing signature"
}

export function Theater() {
  const [raw, setRaw] = useState<string | null>(null)
  const [mail, setMail] = useState<SignedMail | null>(null)
  const [computed, setComputed] = useState<string | null>(null)
  const [verified, setVerified] = useState<VerifyResult | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [steps, setSteps] = useState<Step[]>(titles.map(() => ({ state: "waiting" })))
  const [race, setRace] = useState<RaceResult | null>(null)
  const [gate, setGate] = useState<GateState>("queued")
  const [first, setFirst] = useState<Claimed | null>(null)
  const [second, setSecond] = useState<Claimed | null>(null)
  const [released, setReleased] = useState<Released>(null)
  const [receipt, setReceipt] = useState<{ link: ReceiptLink; shown: ReceiptResult } | null>(null)
  const [running, setRunning] = useState(false)
  const started = useRef(false)
  const editRun = useRef(0)

  const set = (i: number, step: Step) => setSteps((all) => all.map((s, j) => (j === i ? step : s)))

  const applyEdit = useCallback(async (text: string, m: SignedMail, line: number, col: number): Promise<Edit> => {
    const target = m.lines[line]!
    const changed = editAt(text, target.start + col)
    const base: Edit = { line, col, was: changed.was, now: changed.now, raw: changed.raw, hash: null, result: null, checking: true }
    const ticket = ++editRun.current
    setEdit(base)
    const hash = await bodyHash(changed.raw, m.bodyCanon)
    if (ticket === editRun.current) setEdit({ ...base, hash })
    const result = await post<VerifyResult>("verify", { raw: changed.raw })
    const done = { ...base, hash, result, checking: false }
    if (ticket === editRun.current) setEdit(done)
    return done
  }, [])

  const run = useCallback(async () => {
    setRunning(true)
    setRace(null)
    setGate("queued")
    setEdit(null)
    setVerified(null)
    setComputed(null)
    setFirst(null)
    setSecond(null)
    setReleased(null)
    setReceipt(null)
    setSteps(titles.map(() => ({ state: "waiting" })))
    const beat = reducedMotion() ? 0 : 700
    try {
      const text: string = raw ?? (await loadSample())
      setRaw(text)
      const m = readMail(text)
      setMail(m)
      await pause(beat)

      set(0, { state: "running" })
      const [one, hash] = await Promise.all([timed(() => post<VerifyResult>("verify", { raw: text })), bodyHash(text, m.bodyCanon)])
      setVerified(one.value)
      setComputed(hash)
      set(0, one.value.signer ? { state: "done", tone: "good", stamp: `Signed by ${one.value.signer}`, ms: one.ms } : { state: "done", tone: "bad", stamp: "Not verified", ms: one.ms })
      await pause(beat * 2)

      const spot = firstEditable(m)
      if (!spot) throw new Error("No body text to change")
      set(1, { state: "running" })
      const two = await timed(() => applyEdit(text, m, spot.line, spot.col))
      set(1, two.value.result?.signer ? { state: "done", tone: "warn", stamp: "Still signed", ms: two.ms } : { state: "done", tone: "good", stamp: "Caught", ms: two.ms })
      await pause(beat * 2)

      set(2, { state: "running" })
      setGate("pressing")
      const three = await timed(() => post<RaceResult>("race", { n: 50 }))
      setRace(three.value)
      setGate("settled")
      set(2, { state: "done", tone: three.value.guarded.verified === 1 ? "good" : "bad", stamp: `${three.value.guarded.verified} of ${three.value.n} through`, ms: three.ms })
      await pause(beat * 2)

      const ledger = newLedger()
      set(3, { state: "running" })
      const four = await timed(() => claim(text, "order A12", ledger))
      setFirst({ result: four.value, ms: four.ms })
      set(3, { state: "done", tone: claimTone(four.value), stamp: claimStamp(four.value), ms: four.ms })
      if (four.value.verdict === "VERIFIED") {
        await pause(beat + 300)
        setReleased((r) => r ?? { at: new Date().toISOString() })
      }
      await pause(beat)

      set(4, { state: "running" })
      const five = await timed(() => claim(text, "order A13", ledger))
      setSecond({ result: five.value, ms: five.ms })
      set(4, { state: "done", tone: claimTone(five.value), stamp: claimStamp(five.value), ms: five.ms })
      await pause(beat)

      set(5, { state: "running" })
      const made = four.value.verdict === "VERIFIED" ? four.value.receipt : undefined
      if (!made) throw new Error("No receipt came back with the claim")
      const six = await timed(() => post<ReceiptResult>("receipts", { id: made.id }))
      setReceipt({ link: made, shown: six.value })
      set(5, { state: "done", tone: six.value.verified ? "good" : "bad", stamp: six.value.verified ? "Signed by AWS KMS" : "Failed its check", ms: six.ms })
    } catch (e) {
      setSteps((all) => {
        const i = all.findIndex((s) => s.state === "running" || s.state === "waiting")
        return all.map((s, j) => (j === i ? { state: "failed", detail: e instanceof Error ? e.message : String(e) } : s))
      })
    } finally {
      setRunning(false)
    }
  }, [raw, applyEdit])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  const editable = steps[1]?.state === "done"

  const pick = (e: MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-col]")
    const line = target?.parentElement?.dataset.line
    if (!target || line === undefined || !raw || !mail || !editable) return
    const col = Number(target.dataset.col)
    if (!/[A-Za-z0-9.]/.test(mail.lines[Number(line)]!.text[col] ?? "")) return
    void applyEdit(raw, mail, Number(line), col).catch(() => undefined)
  }

  const another = () => {
    if (!raw || !mail || !editable) return
    const from = edit ? { line: edit.line, col: edit.col + 1 } : firstEditable(mail)
    if (!from) return
    for (let line = from.line; line < mail.lines.length; line++) {
      const text = mail.lines[line]!.text
      for (let col = line === from.line ? from.col : 0; col < text.length; col++) {
        if (/[A-Za-z0-9]/.test(text[col]!)) return void applyEdit(raw, mail, line, col).catch(() => undefined)
      }
    }
  }

  const restore = () => {
    editRun.current++
    setEdit(null)
  }

  return (
    <section className="proof" aria-label="The proof, run live">
      <ol className="rail">
        {titles.map((title, i) => {
          const s = steps[i]!
          return (
            <li key={title} className={`rail-step ${s.state} ${s.state === "done" ? s.tone : ""}`} aria-current={s.state === "running" ? "step" : undefined}>
              <span className="rail-n" aria-hidden="true">{i + 1}</span>
              <span className="rail-title">{title}</span>
              <span className="rail-out">
                {s.state === "running" && "Calling the live API"}
                {s.state === "done" && (
                  <>
                    {s.stamp} <span className="ms">{s.ms} ms</span>
                  </>
                )}
                {s.state === "failed" && <span className="error">{s.detail}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <RailNow steps={steps} />

      <div className="canvas">
        <MailObject mail={mail} edit={edit} onPick={pick} />
        <div className="col col-real">
          <h2 className="col-head">Is it real?</h2>
          <KeyLookup mail={mail} step={steps[0]!} verified={verified} />
          <HashCompare mail={mail} computed={computed} edit={edit} onAnother={another} onRestore={restore} busy={!editable} />
        </div>
        <div className="col col-once">
          <h2 className="col-head">Has it been used?</h2>
          <Gate race={race} state={gate} />
          <Claims first={first} second={second} released={released} onRelease={() => setReleased({ at: new Date().toISOString() })} />
          <ReceiptChain receipt={receipt} />
        </div>
      </div>

      <div className="proof-foot">
        <button type="button" onClick={() => void run()} disabled={running}>
          {running ? "Running on the live stack" : "Run it again"}
        </button>
        <p className="muted small">Each run gets its own ledger, so the first claim always wins.</p>
      </div>
    </section>
  )
}

function RailNow({ steps }: { steps: Step[] }) {
  const running = steps.findIndex((s) => s.state === "running" || s.state === "failed")
  const lastDone = steps.map((s) => s.state).lastIndexOf("done")
  const i = running >= 0 ? running : lastDone
  if (i < 0) return <p className="rail-now">Loading the signed email</p>
  const s = steps[i]!
  return (
    <p className={`rail-now ${s.state} ${s.state === "done" ? s.tone : ""}`} aria-hidden="true">
      <b>
        {i + 1}. {titles[i]}
      </b>{" "}
      {s.state === "running" ? "Calling the live API" : s.state === "done" ? `${s.stamp}, ${s.ms} ms` : s.state === "failed" ? s.detail : ""}
    </p>
  )
}

function MailObject({ mail, edit, onPick }: { mail: SignedMail | null; edit: Edit | null; onPick: (e: MouseEvent<HTMLElement>) => void }) {
  const shown = ["v", "a", "c", "d", "s", "h", "bh", "b"]
  const tags = (mail?.tags ?? []).filter((t) => shown.includes(t.tag))
  return (
    <div className="col col-mail">
      <h2 className="col-head">The signed email</h2>
      <p className="col-note">A real post from a public mailing list, signed by gnu.org's mail server. It stands in for the bank's credit alert. The check is the same.</p>
      <div className="mail" aria-label="The signed email, as structured fields">
        <dl className="mail-heads">
          <dt>From</dt>
          <dd>{mail?.from || "Loading the email"}</dd>
          <dt>Subject</dt>
          <dd>{mail?.subject}</dd>
          <dt>Date</dt>
          <dd>{mail?.date}</dd>
        </dl>
        <div className="dkim">
          <p className="dkim-name">DKIM-Signature</p>
          <dl>
            {tags.map((t) => (
              <div key={t.tag} className={`tag tag-${t.tag}`}>
                <dt>{t.tag}=</dt>
                <dd>{t.tag === "h" ? t.value.split(":").join(" ") : t.tag === "b" ? `${t.value.replace(/\s/g, "").slice(0, 24)}… ${t.value.replace(/\s/g, "").length} chars` : t.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mail-body" onClick={onPick}>
          <p className="mail-body-label">Body. Click any letter to change it.</p>
          <p className="mail-text">
            {(mail?.lines ?? []).map((l, i) => (
              <span key={l.start} data-line={i} className="mail-line">
                {[...l.text].map((ch, k) => (
                  <span key={k} data-col={k} className={edit && edit.line === i && edit.col === k ? "edited" : undefined}>
                    {edit && edit.line === i && edit.col === k ? edit.now : ch}
                  </span>
                ))}{" "}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  )
}

function KeyLookup({ mail, step, verified }: { mail: SignedMail | null; step: Step; verified: VerifyResult | null }) {
  const host = mail ? `${mail.selector}._domainkey.${mail.domain}` : "selector._domainkey.domain"
  const sig = verified?.signatures.find((s) => s.domain === mail?.domain) ?? verified?.signatures[0]
  const state = step.state === "running" ? "asking" : verified ? (verified.signer ? "pass" : "fail") : "idle"
  return (
    <div className={`panel lookup ${state}`}>
      <h3>Fetch the sender's public key</h3>
      <div className="wire" aria-hidden="true">
        <span className="end">Lambda</span>
        <span className="line">
          <i className="packet" />
        </span>
        <span className="end dns">DNS</span>
      </div>
      <p className="host">
        TXT <b>{host}</b>
      </p>
      <p className="panel-out" aria-live="polite">
        {state === "idle" && "Waiting to ask DNS."}
        {state === "asking" && "Asking DNS for the key, then checking the signature."}
        {state === "pass" && (
          <>
            Key returned. The signature over {mail?.signedHeaders.length ?? 0} headers and the body checks out{sig?.aligned ? ", and gnu.org matches the From address" : ""}.
          </>
        )}
        {state === "fail" && verified && failure(verified)}
      </p>
    </div>
  )
}

function HashText({ value, against }: { value: string; against?: string }) {
  return (
    <code className="hash">
      {[...value].map((ch, i) => (
        <span key={i} className={against === undefined ? undefined : against[i] === ch ? "same" : "diff"}>
          {ch}
        </span>
      ))}
    </code>
  )
}

function HashCompare({ mail, computed, edit, onAnother, onRestore, busy }: { mail: SignedMail | null; computed: string | null; edit: Edit | null; onAnother: () => void; onRestore: () => void; busy: boolean }) {
  const signed = mail?.bodyHash ?? ""
  const same = computed !== null && computed === signed
  const differing = edit?.hash ? [...edit.hash].filter((c, i) => c !== signed[i]).length : 0
  return (
    <div className="panel hashes">
      <h3>Hash the body and compare</h3>
      <div className="hash-row">
        <span className="hash-label">In the signature, bh=</span>
        {signed ? <HashText value={signed} /> : <code className="hash pending">waiting</code>}
      </div>
      <div className={`hash-row ${computed ? (same ? "match" : "mismatch") : ""}`}>
        <span className="hash-label">SHA-256 of the body, computed in your browser</span>
        {computed ? <HashText value={computed} against={signed} /> : <code className="hash pending">waiting</code>}
        {computed && <span className="hash-verdict">{same ? "Identical" : "Different"}</span>}
      </div>
      <div className={`hash-row ${edit?.hash ? "mismatch" : "ghost-row"}`}>
        <span className="hash-label">
          {edit ? (
            <>
              After changing <q>{edit.was}</q> to <q>{edit.now}</q>
            </>
          ) : (
            "After changing one character"
          )}
        </span>
        {edit?.hash ? <HashText value={edit.hash} against={signed} /> : <code className="hash pending">waiting</code>}
        {edit?.hash && <span className="hash-verdict">{differing} of 44 characters differ</span>}
      </div>
      <p className="panel-out" aria-live="polite">
        {edit?.checking && "Sending the edited email to the live API."}
        {edit?.result && (edit.result.signer ? "This sender signs only part of the body, so the change slipped past." : `The live API says: ${failure(edit.result)}.`)}
        {!edit && "One changed letter changes the whole hash. Nobody can fix that without the sender's private key."}
      </p>
      {mail && computed && (
        <div className="row">
          <button type="button" className="ghost" onClick={onAnother} disabled={busy}>
            Change the next character
          </button>
          {edit && (
            <button type="button" className="ghost" onClick={onRestore} disabled={busy}>
              Put it back
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const grid = (i: number, x0: number, step: number) => ({ x: x0 + (i % 10) * step, y: 12 + Math.floor(i / 10) * 10 })

function dotsFor(race: RaceResult | null, state: GateState, lane: "guarded" | "naive", n: number) {
  return Array.from({ length: n }, (_, i) => {
    const start = grid(i, 8, 9)
    if (state === "pressing") {
      const c = i % 5
      const r = Math.floor(i / 5)
      return { x: lane === "guarded" ? 122 + c * 8 : 150 + c * 8, y: 10 + r * 5, kind: "pressing" }
    }
    if (state === "queued" || !race) return { ...start, kind: "queued" }
    if (lane === "guarded") {
      const { verified, alreadyClaimed } = race.guarded
      if (i < verified) return { ...grid(i, 250, 9), kind: "win" }
      if (i < verified + alreadyClaimed) return { ...start, kind: "bounce" }
      return { ...start, kind: "err" }
    }
    if (i < race.naive.accepted) return { ...grid(i, 250, 9), kind: i === 0 ? "win" : "double" }
    return { ...start, kind: "err" }
  })
}

function Lane({ race, state, lane }: { race: RaceResult | null; state: GateState; lane: "guarded" | "naive" }) {
  const n = race?.n ?? 50
  const dots = dotsFor(race, state, lane, n)
  return (
    <svg className={`lane-svg ${lane}`} viewBox="0 0 340 64" role="img" aria-label={lane === "guarded" ? "Claims against the unique index" : "Claims against check, then insert"}>
      {lane === "guarded" ? <rect className="gate-bar" x="170" y="4" width="5" height="56" rx="1" /> : <line className="gate-open" x1="172" y1="4" x2="172" y2="60" />}
      {dots.map((d, i) => (
        <circle key={i} className={`dot ${d.kind}`} r="3.2" cx="0" cy="0" style={{ transform: `translate(${d.x}px, ${d.y}px)`, transitionDelay: `${state === "settled" ? i * 14 : i * 6}ms` }} />
      ))}
    </svg>
  )
}

function Gate({ race, state }: { race: RaceResult | null; state: GateState }) {
  return (
    <div className="panel gate">
      <h3>Fifty claims for one record, at the same instant</h3>
      <div className="lane-block">
        <p className="lane-name">Aurora DSQL, one row per record</p>
        <Lane race={race} state={state} lane="guarded" />
        <p className="lane-tally">
          {race ? (
            <>
              <b className="good">{race.guarded.verified} through</b>, {race.guarded.alreadyClaimed} refused as already claimed, {race.guarded.retries} retries, {race.guarded.ms} ms
            </>
          ) : state === "pressing" ? (
            "50 claims in flight"
          ) : (
            "Waiting"
          )}
        </p>
      </div>
      <div className="lane-block">
        <p className="lane-name">Check, then insert</p>
        <Lane race={race} state={state} lane="naive" />
        <p className="lane-tally">
          {race ? (
            <>
              <b className="bad">{race.naive.accepted} through</b>, so {Math.max(0, race.naive.accepted - 1)} double spends
            </>
          ) : (
            "Same 50 claims, no unique index"
          )}
        </p>
      </div>
    </div>
  )
}

function Claims({ first, second, released, onRelease }: { first: Claimed | null; second: Claimed | null; released: Released; onRelease: () => void }) {
  const ok = first?.result.verdict === "VERIFIED"
  const prior = second?.result.verdict === "ALREADY_CLAIMED" ? second.result.priorClaim : null
  return (
    <div className="panel claims">
      <h3>The seller's screen</h3>
      <div className={`order ${first ? claimTone(first.result) : "waiting"}`}>
        <span className="order-ref">Order A12</span>
        <span className="order-state">{first ? (first.result.verdict === "VERIFIED" ? `Claimed at ${clockTime(first.result.claimedAt)}` : first.result.reason) : "Waiting"}</span>
        {released ? (
          <span className="released">Goods released at {clockTime(released.at)}</span>
        ) : (
          <button type="button" className="release-btn" disabled={!ok} onClick={onRelease}>
            Release goods
          </button>
        )}
      </div>
      <div className={`order ${second ? (second.result.verdict === "ALREADY_CLAIMED" ? "warn" : claimTone(second.result)) : "waiting"}`}>
        <span className="order-ref">Order A13</span>
        <span className="order-state">
          {second ? (prior ? `Same email, already used for ${prior.claimRef} at ${clockTime(prior.createdAt)}` : second.result.reason) : "Waiting"}
        </span>
        <button type="button" className="release-btn" disabled>
          Release goods
        </button>
      </div>
    </div>
  )
}

function ReceiptChain({ receipt }: { receipt: { link: ReceiptLink; shown: ReceiptResult } | null }) {
  const r = receipt?.shown.receipt
  return (
    <div className={`panel chain ${receipt ? (receipt.shown.verified ? "good" : "bad") : ""}`}>
      <h3>The buyer's receipt</h3>
      {receipt && r ? (
        <>
          <div className="links" aria-label="Receipt hash chain">
            <span className="link prev">
              <small>{r.seq > 1 ? `Entry ${r.seq - 1}` : "Start of the ledger"}</small>
              <code>{receipt.link.prevHash.slice(0, 10)}</code>
            </span>
            <span className="chain-arrow" aria-hidden="true" />
            <span className="link this">
              <small>Entry {r.seq}, this claim</small>
              <code>{receipt.link.hash.slice(0, 10)}</code>
            </span>
          </div>
          <p className="panel-out">
            {receipt.shown.verified ? "AWS KMS signed it. The server just checked the signature and the hash again." : "The receipt failed its check."}{" "}
            <a href={`#r=${receipt.link.id}`}>Open the receipt the buyer sees</a>
          </p>
        </>
      ) : (
        <p className="panel-out">Signed by AWS KMS after the first claim, and linked to the entry before it.</p>
      )}
    </div>
  )
}
