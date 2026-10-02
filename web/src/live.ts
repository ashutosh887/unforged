import { useCallback, useEffect, useRef, useState } from "react"
import { post, type RaceResult, type ReceiptLink, type ReceiptResult, type RecordClaimResult, type VerifyResult } from "./api"
import { editOneCharacter } from "./Signature"
import { clockTime } from "./parts"

export type Tone = "good" | "warn" | "bad" | "neutral"
export type Release = { state: "open" } | { state: "pressed"; text: string } | { state: "blocked"; reason: string }
export type Done = { state: "done"; tone: Tone; stamp: string; detail: string; ms: number; link?: { href: string; label: string }; release?: Release; claim?: RecordClaimResult }
export type Step = { state: "waiting" } | { state: "running" } | Done | { state: "failed"; detail: string }
export type Mail = { from: string; subject: string; domain: string; selector: string; lines: string[] }
export type Edit = { line: number; col: number; now: string }

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
}

export function useLiveRun(autoStart: boolean): LiveRun {
  const [raw, setRaw] = useState<string | null>(null)
  const [mail, setMail] = useState<Mail | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [steps, setSteps] = useState<Step[]>(titles.map(() => ({ state: "waiting" })))
  const [race, setRace] = useState<RaceResult | null>(null)
  const [receipt, setReceipt] = useState<ReceiptLink | null>(null)
  const [running, setRunning] = useState(false)
  const started = useRef(false)

  const set = (i: number, step: Step) => setSteps((all) => all.map((s, j) => (j === i ? step : s)))
  const patch = (i: number, change: Partial<Done>) => setSteps((all) => all.map((s, j) => (j === i && s.state === "done" ? { ...s, ...change } : s)))

  const run = useCallback(async () => {
    started.current = true
    setRunning(true)
    setRace(null)
    setEdit(null)
    setReceipt(null)
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
      setEdit({ line, col: line >= 0 ? [...editedLines[line]!].findIndex((c, k) => c !== parsed.lines[line]![k]) : -1, now: changed.now })
      set(1, { state: "running" })
      await pause(beat)
      const second = await timed(() => post<VerifyResult>("verify", { raw: changed.raw }))
      set(1, second.value.signer
        ? { state: "done", tone: "warn", stamp: "Still signed", detail: "This sender signs only part of the body.", ms: second.ms }
        : { state: "done", tone: "bad", stamp: "Rejected", detail: `"${changed.was}" became "${changed.now}". ${second.value.signatures.find((s) => s.detail)?.detail ?? "The signature no longer verifies"}.`, ms: second.ms })
      await pause(beat)

      set(2, { state: "running" })
      const third = await timed(() => post<RaceResult>("race", { n: 50 }))
      setRace(third.value)
      set(2, {
        state: "done",
        tone: third.value.guarded.verified === 1 ? "good" : "bad",
        stamp: `${third.value.guarded.verified} of 50 accepted`,
        detail: `Aurora DSQL keeps one claim row per record, so one claim got through and ${third.value.guarded.alreadyClaimed} bounced. The same 50 against a check-then-insert table were all accepted, ${third.value.naive.accepted - 1} of them double spends.`,
        ms: third.ms,
      })
      await pause(beat)

      const ledger = newLedger()
      set(3, { state: "running" })
      const fourth = await timed(() => claim(text, orders[0]!, ledger))
      set(3, claimStep(fourth.value, fourth.ms))
      if (fourth.value.verdict === "VERIFIED") {
        await pause(beat + 300)
        patch(3, { release: { state: "pressed", text: `Released at ${clockTime(new Date().toISOString())}` } })
      }
      await pause(beat)

      set(4, { state: "running" })
      const fifth = await timed(() => claim(text, orders[1]!, ledger))
      set(4, claimStep(fifth.value, fifth.ms))
      await pause(beat)

      set(5, { state: "running" })
      const made = fourth.value.verdict === "VERIFIED" ? fourth.value.receipt : undefined
      if (!made) throw new Error("No receipt came back with the claim")
      const shown = await timed(() => post<ReceiptResult>("receipts", { id: made.id }))
      setReceipt(made)
      set(5, {
        state: "done",
        tone: shown.value.verified ? "good" : "bad",
        stamp: shown.value.verified ? "Receipt signed by AWS KMS" : "Receipt failed its check",
        detail: `Entry ${made.seq} in this ledger, hash ${made.hash.slice(0, 12)} linked to ${made.prevHash.slice(0, 12)}. The server checked the signature and the hash again just now.`,
        ms: shown.ms,
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
  }, [raw])

  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true
    void run()
  }, [autoStart, run])

  return { mail, edit, steps, race, receipt, running, run }
}
