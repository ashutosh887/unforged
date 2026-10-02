import { useCallback, useEffect, useRef, useState } from "react"
import { post, type RaceResult, type ReceiptLink, type ReceiptResult, type RecordClaimResult, type VerifyResult } from "./api"
import { clockTime } from "./parts"
import { bodyHash, editAt, firstEditable, readMail, type SignedMail } from "./proof"

export type Tone = "good" | "warn" | "bad" | "neutral"
export type Release = { state: "open" } | { state: "pressed"; text: string } | { state: "blocked"; reason: string }
export type Done = { state: "done"; tone: Tone; stamp: string; detail: string; ms: number; link?: { href: string; label: string }; release?: Release; claim?: RecordClaimResult }
export type Step = { state: "waiting" } | { state: "running" } | Done | { state: "failed"; detail: string }
export type Mail = { from: string; subject: string; domain: string; selector: string; lines: string[] }
export type Edit = { line: number; col: number; now: string }
export type Probe = { line: number; col: number; was: string; now: string; raw: string; hash: string | null; result: VerifyResult | null; checking: boolean }
export type Claimed = { result: RecordClaimResult; ms: number }
export type GateState = "queued" | "pressing" | "settled"

export const titles = [
  "Check the sender's signature",
  "Change one character and check again",
  "Fire 50 claims at one record at once",
  "Claim the email for order A12",
  "Show the same email for order A13",
  "Countersign the buyer's receipt",
]

export const orders = ["order A12", "order A13"]

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim()
  return name || from.replace(/^.*@/, "").replace(/>.*$/, "")
}

function asMail(m: SignedMail): Mail {
  return { from: senderName(m.from), subject: m.subject, domain: m.domain, selector: m.selector, lines: m.lines.map((l) => l.text) }
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

function failure(result: VerifyResult): string {
  return result.signatures.find((s) => s.detail)?.detail ?? "The signature no longer verifies"
}

function claimStep(result: RecordClaimResult, ms: number): Done {
  if (result.verdict === "VERIFIED") return { state: "done", tone: "good", stamp: "Verified, claimed once", detail: `Claimed for ${result.claimRef} at ${clockTime(result.claimedAt)}.`, ms, release: { state: "open" }, claim: result }
  if (result.verdict === "ALREADY_CLAIMED") {
    const first = `First claimed for ${result.priorClaim.claimRef} at ${clockTime(result.priorClaim.createdAt)}.`
    return { state: "done", tone: "warn", stamp: "Already claimed", detail: `${first} The email is real. It was used before.`, ms, release: { state: "blocked", reason: `Already used for ${result.priorClaim.claimRef}.` }, claim: result }
  }
  return { state: "done", tone: "bad", stamp: "Rejected", detail: result.reason, ms, release: { state: "blocked", reason: result.reason }, claim: result }
}

export type LiveRun = {
  mail: Mail | null
  edit: Edit | null
  steps: Step[]
  race: RaceResult | null
  receipt: ReceiptLink | null
  running: boolean
  run: () => Promise<void>
  signed: SignedMail | null
  computed: string | null
  verified: VerifyResult | null
  probe: Probe | null
  gate: GateState
  first: Claimed | null
  second: Claimed | null
  released: string | null
  shown: ReceiptResult | null
  editable: boolean
  editAt: (line: number, col: number) => void
  editNext: () => void
  restore: () => void
  release: () => void
}

export function useLiveRun(autoStart: boolean): LiveRun {
  const [raw, setRaw] = useState<string | null>(null)
  const [signed, setSigned] = useState<SignedMail | null>(null)
  const [computed, setComputed] = useState<string | null>(null)
  const [verified, setVerified] = useState<VerifyResult | null>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [steps, setSteps] = useState<Step[]>(titles.map(() => ({ state: "waiting" })))
  const [race, setRace] = useState<RaceResult | null>(null)
  const [gate, setGate] = useState<GateState>("queued")
  const [first, setFirst] = useState<Claimed | null>(null)
  const [second, setSecond] = useState<Claimed | null>(null)
  const [released, setReleased] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptLink | null>(null)
  const [shown, setShown] = useState<ReceiptResult | null>(null)
  const [running, setRunning] = useState(false)
  const started = useRef(false)
  const probeRun = useRef(0)

  const set = (i: number, step: Step) => setSteps((all) => all.map((s, j) => (j === i ? step : s)))
  const patch = (i: number, change: Partial<Done>) => setSteps((all) => all.map((s, j) => (j === i && s.state === "done" ? { ...s, ...change } : s)))

  const applyEdit = useCallback(async (text: string, m: SignedMail, line: number, col: number): Promise<Probe> => {
    const target = m.lines[line]!
    const changed = editAt(text, target.start + col)
    const base: Probe = { line, col, was: changed.was, now: changed.now, raw: changed.raw, hash: null, result: null, checking: true }
    const ticket = ++probeRun.current
    setProbe(base)
    const hash = await bodyHash(changed.raw, m.bodyCanon)
    if (ticket === probeRun.current) setProbe({ ...base, hash })
    const result = await post<VerifyResult>("verify", { raw: changed.raw })
    const done = { ...base, hash, result, checking: false }
    if (ticket === probeRun.current) setProbe(done)
    return done
  }, [])

  const markReleased = useCallback((at: string) => {
    setReleased((r) => r ?? at)
    patch(3, { release: { state: "pressed", text: `Released at ${clockTime(at)}` } })
  }, [])

  const run = useCallback(async () => {
    started.current = true
    setRunning(true)
    setRace(null)
    setGate("queued")
    setProbe(null)
    setVerified(null)
    setComputed(null)
    setFirst(null)
    setSecond(null)
    setReleased(null)
    setReceipt(null)
    setShown(null)
    setSteps(titles.map(() => ({ state: "waiting" })))
    const beat = reducedMotion() ? 0 : 700
    try {
      const text: string = raw ?? (await loadSample())
      setRaw(text)
      const m = readMail(text)
      setSigned(m)
      await pause(beat)

      set(0, { state: "running" })
      const [one, hash] = await Promise.all([timed(() => post<VerifyResult>("verify", { raw: text })), bodyHash(text, m.bodyCanon)])
      setVerified(one.value)
      setComputed(hash)
      set(0, one.value.signer
        ? { state: "done", tone: "good", stamp: `Signed by ${one.value.signer}`, detail: `Fetched the public key at ${m.selector}._domainkey.${m.domain} from DNS and checked the signature over the headers and body.`, ms: one.ms }
        : { state: "done", tone: "bad", stamp: "Not verified", detail: failure(one.value), ms: one.ms })
      await pause(beat * 2)

      const spot = firstEditable(m)
      if (!spot) throw new Error("No body text to change")
      set(1, { state: "running" })
      const two = await timed(() => applyEdit(text, m, spot.line, spot.col))
      const edited = two.value
      set(1, edited.result?.signer
        ? { state: "done", tone: "warn", stamp: "Still signed", detail: "This sender signs only part of the body.", ms: two.ms }
        : { state: "done", tone: "bad", stamp: "Rejected", detail: `"${edited.was}" became "${edited.now}". ${edited.result ? failure(edited.result) : "The signature no longer verifies"}.`, ms: two.ms })
      await pause(beat * 2)

      set(2, { state: "running" })
      setGate("pressing")
      const three = await timed(() => post<RaceResult>("race", { n: 50 }))
      setRace(three.value)
      setGate("settled")
      set(2, {
        state: "done",
        tone: three.value.guarded.verified === 1 ? "good" : "bad",
        stamp: `${three.value.guarded.verified} of ${three.value.n} accepted`,
        detail: `Aurora DSQL keeps one claim row per record, so one claim got through and ${three.value.guarded.alreadyClaimed} bounced. The same ${three.value.n} against a check-then-insert table were all accepted, ${Math.max(0, three.value.naive.accepted - 1)} of them double spends.`,
        ms: three.ms,
      })
      await pause(beat * 2)

      const ledger = newLedger()
      set(3, { state: "running" })
      const four = await timed(() => claim(text, orders[0]!, ledger))
      setFirst({ result: four.value, ms: four.ms })
      set(3, claimStep(four.value, four.ms))
      if (four.value.verdict === "VERIFIED") {
        await pause(beat + 300)
        markReleased(new Date().toISOString())
      }
      await pause(beat)

      set(4, { state: "running" })
      const five = await timed(() => claim(text, orders[1]!, ledger))
      setSecond({ result: five.value, ms: five.ms })
      set(4, claimStep(five.value, five.ms))
      await pause(beat)

      set(5, { state: "running" })
      const made = four.value.verdict === "VERIFIED" ? four.value.receipt : undefined
      if (!made) throw new Error("No receipt came back with the claim")
      const six = await timed(() => post<ReceiptResult>("receipts", { id: made.id }))
      setReceipt(made)
      setShown(six.value)
      set(5, {
        state: "done",
        tone: six.value.verified ? "good" : "bad",
        stamp: six.value.verified ? "Receipt signed by AWS KMS" : "Receipt failed its check",
        detail: `Entry ${made.seq} in this ledger, hash ${made.hash.slice(0, 12)} linked to ${made.prevHash.slice(0, 12)}. The server checked the signature and the hash again just now.`,
        ms: six.ms,
        link: { href: `#r=${made.id}`, label: "Open the buyer's receipt" },
      })
    } catch (e) {
      setSteps((all) => {
        const i = all.findIndex((s) => s.state === "running" || s.state === "waiting")
        return all.map((s, j) => (j === i ? { state: "failed", detail: e instanceof Error ? e.message : String(e) } : s))
      })
    } finally {
      setRunning(false)
    }
  }, [raw, applyEdit, markReleased])

  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    void run()
  }, [autoStart, run])

  const editable = steps[1]?.state === "done"

  const editAtSpot = useCallback(
    (line: number, col: number) => {
      if (!raw || !signed || !editable) return
      if (!/[A-Za-z0-9.]/.test(signed.lines[line]?.text[col] ?? "")) return
      void applyEdit(raw, signed, line, col).catch(() => undefined)
    },
    [raw, signed, editable, applyEdit],
  )

  const editNext = useCallback(() => {
    if (!raw || !signed || !editable) return
    const from = probe ? { line: probe.line, col: probe.col + 1 } : firstEditable(signed)
    if (!from) return
    for (let line = from.line; line < signed.lines.length; line++) {
      const text = signed.lines[line]!.text
      for (let col = line === from.line ? from.col : 0; col < text.length; col++) {
        if (/[A-Za-z0-9]/.test(text[col]!)) return void applyEdit(raw, signed, line, col).catch(() => undefined)
      }
    }
  }, [raw, signed, editable, probe, applyEdit])

  const restore = useCallback(() => {
    probeRun.current++
    setProbe(null)
  }, [])

  const release = useCallback(() => markReleased(new Date().toISOString()), [markReleased])

  return {
    mail: signed ? asMail(signed) : null,
    edit: probe ? { line: probe.line, col: probe.col, now: probe.now } : null,
    steps,
    race,
    receipt,
    running,
    run,
    signed,
    computed,
    verified,
    probe,
    gate,
    first,
    second,
    released,
    shown,
    editable,
    editAt: editAtSpot,
    editNext,
    restore,
    release,
  }
}
