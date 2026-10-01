import { useEffect, useState, type FormEvent } from "react"
import { post, type VerifyResult } from "./api"
import { money } from "./parts"

type Edit = { raw: string; at: number; was: string; now: string }
type Run = { label: string; result: VerifyResult; edit?: Edit }

function bodyStart(raw: string): number {
  const at = raw.search(/\r?\n\r?\n/)
  return at < 0 ? -1 : at + (raw.slice(at).match(/^\r?\n\r?\n/)?.[0].length ?? 2)
}

function editOneCharacter(raw: string): Edit | null {
  const start = bodyStart(raw)
  if (start < 0) return null
  let lineStart = start
  for (const line of raw.slice(start).split("\n")) {
    if (!line.startsWith("--") && !/^[\w-]+:/.test(line)) {
      const offset = line.search(/[0-9]/) >= 0 ? line.search(/[0-9]/) : line.search(/[A-Za-z]/)
      if (offset >= 0) {
        const at = lineStart + offset
        const was = raw[at]!
        const now = /[0-9]/.test(was) ? String((Number(was) + 1) % 10) : was === "z" ? "a" : was === "Z" ? "A" : String.fromCharCode(was.charCodeAt(0) + 1)
        return { raw: raw.slice(0, at) + now + raw.slice(at + 1), at: at - start, was, now }
      }
    }
    lineStart += line.length + 1
  }
  return null
}

export function SignatureCheck({ sample }: { sample?: { label: string; load: () => Promise<string | null> } }) {
  const [raw, setRaw] = useState("")
  const [runs, setRuns] = useState<Run[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [hasSample, setHasSample] = useState(false)

  useEffect(() => {
    let live = true
    void sample?.load().then((text) => live && setHasSample(Boolean(text)))
    return () => {
      live = false
    }
  }, [sample])

  const verify = async (label: string, text: string, edit?: Edit) => {
    setBusy(true)
    setError("")
    try {
      const result = await post<VerifyResult>("verify", { raw: text })
      setRuns((all) => [...(edit ? all.slice(0, 1) : []), { label, result, ...(edit ? { edit } : {}) }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void verify("As pasted", raw)
  }

  const tamper = () => {
    const edit = editOneCharacter(raw)
    if (!edit) return setError("No body text to change.")
    void verify("One character changed", edit.raw, edit)
  }

  const useSample = async () => {
    if (!sample) return
    const text = await sample.load()
    if (!text) return setError("The sample is not published yet.")
    setRaw(text)
    void verify("As pasted", text)
  }

  const original = runs[0]

  return (
    <section className="card">
      <h2>Check any signed email</h2>
      <p className="muted small">
        Paste the raw source of any email you received (Gmail: ⋮ → Show original → Copy to clipboard). Unforged checks its DKIM signature against the sender's DNS key. Then change one
        character and watch the signature break. Nothing you paste is stored.
      </p>
      <form onSubmit={submit} className="stack">
        <label>
          Raw email, headers included
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} spellCheck={false} required />
        </label>
        <div className="row">
          <button disabled={busy || !raw.trim()}>{busy ? "Checking…" : "Check signature"}</button>
          <button type="button" className="ghost" disabled={busy || !original?.result.signer} onClick={tamper}>
            Change one character, check again
          </button>
          {sample && hasSample && (
            <button type="button" className="ghost" disabled={busy} onClick={() => void useSample()}>
              {sample.label}
            </button>
          )}
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {runs.length > 0 && (
        <div className="compare">
          {runs.map((run) => (
            <Report key={run.label} run={run} />
          ))}
        </div>
      )}
    </section>
  )
}

function Report({ run }: { run: Run }) {
  const { result, edit } = run
  const signed = Boolean(result.signer)
  const tone = signed ? "good" : result.signatures.length ? "bad" : "neutral"
  const failing = result.signatures.find((s) => s.result !== "pass")
  return (
    <article className={`verdict ${tone}`}>
      <h4>{run.label}</h4>
      <h3>{signed ? `Signed by ${result.signer}` : result.signatures.length ? "Signature broken" : "Not signed"}</h3>
      {edit && (
        <p className="small">
          Body character {edit.at + 1}: <span className="mono">{edit.was}</span> → <span className="mono">{edit.now}</span>
        </p>
      )}
      <dl className="facts">
        <dt>From</dt>
        <dd className="mono">{result.from ?? "—"}</dd>
        {distinct(result.signatures).map((s) => (
          <SignatureRow key={`${s.domain}-${s.selector}-${s.result}`} s={s} />
        ))}
        {!signed && failing?.detail && (
          <>
            <dt>Why</dt>
            <dd>{failing.detail}</dd>
          </>
        )}
        <dt>As a bank credit</dt>
        <dd>{result.bankCredit ? `${result.bankCredit.bank.toUpperCase()} · ${money(result.bankCredit.amountPaise)} · UTR ${result.bankCredit.utr}` : result.notStoredBecause}</dd>
      </dl>
    </article>
  )
}

function distinct(signatures: VerifyResult["signatures"]): VerifyResult["signatures"] {
  return signatures.filter((s, i) => signatures.findIndex((o) => o.domain === s.domain && o.selector === s.selector && o.result === s.result) === i)
}

function SignatureRow({ s }: { s: VerifyResult["signatures"][number] }) {
  return (
    <>
      <dt>DKIM</dt>
      <dd>
        <span className="mono">
          d={s.domain} s={s.selector}
        </span>{" "}
        · {s.result === "pass" ? (s.aligned ? "passes, aligned with From" : "passes, not aligned with From") : "fails"}
      </dd>
    </>
  )
}
