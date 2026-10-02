import type { MouseEvent } from "react"
import type { RaceResult, ReceiptLink, ReceiptResult, VerifyResult } from "./api"
import { senderName, titles, type Claimed, type GateState, type LiveRun, type Probe, type Step } from "./live"
import { clockTime } from "./parts"
import type { SignedMail } from "./proof"

type Tone = "good" | "warn" | "bad"

function failure(result: VerifyResult): string {
  return result.signatures.find((s) => s.detail)?.detail ?? "No passing signature"
}

function claimTone(c: Claimed): Tone {
  return c.result.verdict === "VERIFIED" ? "good" : c.result.verdict === "ALREADY_CLAIMED" ? "warn" : "bad"
}

function short(s: Step): string {
  if (s.state === "running") return s.note ?? "Calling the live API"
  if (s.state === "failed") return s.detail
  if (s.state === "done") return s.stamp
  return ""
}

export function ProofCanvas({ live }: { live: LiveRun }) {
  const { steps, signed, probe, computed, verified, race, gate, first, second, released, receipt, shown, running, editable } = live

  const pick = (e: MouseEvent<HTMLElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-col]")
    const line = target?.parentElement?.dataset.line
    if (!target || line === undefined) return
    live.editAt(Number(line), Number(target.dataset.col))
  }

  return (
    <section className="pcanvas" aria-label="The proof, run live">
      <ol className="pc-rail">
        {titles.map((title, i) => {
          const s = steps[i]!
          return (
            <li key={title} className={`pc-rail-step ${s.state} ${s.state === "done" ? s.tone : ""}`} aria-current={s.state === "running" ? "step" : undefined}>
              <span className="pc-rail-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="pc-rail-title">{title}</span>
              <span className="pc-rail-out">
                {short(s)} {s.state === "done" && <span className="pc-ms">{s.ms} ms</span>}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="pc-canvas">
        <MailObject mail={signed} probe={probe} onPick={pick} />
        <div className="pc-col pc-col-real">
          <h3 className="pc-col-head">Is it real?</h3>
          <KeyLookup mail={signed} step={steps[0]!} verified={verified} />
          <HashCompare mail={signed} computed={computed} probe={probe} onAnother={live.editNext} onRestore={live.restore} busy={!editable} />
        </div>
        <div className="pc-col pc-col-once">
          <h3 className="pc-col-head">Has it been used?</h3>
          <Gate race={race} state={gate} />
          <Claims first={first} second={second} released={released} onRelease={live.release} />
          <ReceiptChain link={receipt} shown={shown} />
        </div>
      </div>

      <div className="pcanvas-foot">
        <button type="button" className="primary" onClick={() => void live.run()} disabled={running}>
          {running ? "Running on the live stack" : "Run it again"}
        </button>
        <p className="muted small">Each run gets its own ledger, so the first claim always wins.</p>
      </div>
    </section>
  )
}

function MailObject({ mail, probe, onPick }: { mail: SignedMail | null; probe: Probe | null; onPick: (e: MouseEvent<HTMLElement>) => void }) {
  const shown = ["v", "a", "c", "d", "s", "h", "bh", "b"]
  const tags = (mail?.tags ?? []).filter((t) => shown.includes(t.tag))
  return (
    <div className="pc-col pc-col-mail">
      <h3 className="pc-col-head">The signed email</h3>
      <p className="pc-col-note">A real post from a public mailing list, signed by gnu.org's mail server. It stands in for the bank's credit alert. The check is the same.</p>
      <div className="pc-mail" aria-label="The signed email, as structured fields">
        <dl className="pc-mail-heads">
          <dt>From</dt>
          <dd>{mail ? `${senderName(mail.from)}, ${mail.domain}` : "Loading the email"}</dd>
          <dt>Subject</dt>
          <dd>{mail?.subject}</dd>
          <dt>Date</dt>
          <dd>{mail?.date}</dd>
        </dl>
        <div className="pc-dkim">
          <p className="pc-dkim-name">DKIM-Signature</p>
          <dl>
            {tags.map((t) => (
              <div key={t.tag} className={`pc-tag pc-tag-${t.tag}`}>
                <dt>{t.tag}=</dt>
                <dd>{t.tag === "h" ? t.value.split(":").join(" ") : t.tag === "b" ? `${t.value.replace(/\s/g, "").slice(0, 24)} and ${t.value.replace(/\s/g, "").length - 24} more characters` : t.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="pc-mail-body" onClick={onPick}>
          <p className="pc-mail-body-label">Body. Click any letter to change it.</p>
          <p className="pc-mail-text">
            {(mail?.lines ?? []).map((l, i) => (
              <span key={l.start} data-line={i} className="pc-mail-line">
                {[...l.text].map((ch, k) => (
                  <span key={k} data-col={k} className={probe && probe.line === i && probe.col === k ? "pc-edited" : undefined}>
                    {probe && probe.line === i && probe.col === k ? probe.now : ch}
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
    <div className={`pc-panel pc-lookup ${state}`}>
      <h4>Fetch the sender's public key</h4>
      <div className="pc-wire" aria-hidden="true">
        <span className="pc-end">Lambda</span>
        <span className="pc-line">
          <i className="pc-packet" />
        </span>
        <span className="pc-end pc-dns">DNS</span>
      </div>
      <p className="pc-host">
        TXT <b>{host}</b>
      </p>
      <p className="pc-panel-out" aria-live="polite">
        {state === "idle" && "Waiting to ask DNS."}
        {state === "asking" && "Asking DNS for the key, then checking the signature."}
        {state === "pass" && `Key returned. The signature over ${mail?.signedHeaders.length ?? 0} headers and the body checks out${sig?.aligned ? `, and ${mail?.domain} matches the From address` : ""}.`}
        {state === "fail" && verified && failure(verified)}
      </p>
    </div>
  )
}

function HashText({ value, against }: { value: string; against?: string }) {
  return (
    <code className="pc-hash">
      {[...value].map((ch, i) => (
        <span key={i} className={against === undefined ? undefined : against[i] === ch ? "pc-same" : "pc-diff"}>
          {ch}
        </span>
      ))}
    </code>
  )
}

function HashCompare({ mail, computed, probe, onAnother, onRestore, busy }: { mail: SignedMail | null; computed: string | null; probe: Probe | null; onAnother: () => void; onRestore: () => void; busy: boolean }) {
  const signed = mail?.bodyHash ?? ""
  const same = computed !== null && computed === signed
  const differing = probe?.hash ? [...probe.hash].filter((c, i) => c !== signed[i]).length : 0
  return (
    <div className="pc-panel pc-hashes">
      <h4>Hash the body and compare</h4>
      <div className="pc-hash-row">
        <span className="pc-hash-label">In the signature, bh=</span>
        {signed ? <HashText value={signed} /> : <code className="pc-hash pc-pending">waiting</code>}
      </div>
      <div className={`pc-hash-row ${computed ? (same ? "match" : "mismatch") : ""}`}>
        <span className="pc-hash-label">SHA-256 of the body, computed in your browser</span>
        {computed ? <HashText value={computed} against={signed} /> : <code className="pc-hash pc-pending">waiting</code>}
        {computed && <span className="pc-hash-verdict">{same ? "Identical" : "Different"}</span>}
      </div>
      <div className={`pc-hash-row ${probe?.hash ? "mismatch" : "pc-ghost-row"}`}>
        <span className="pc-hash-label">{probe ? `After changing "${probe.was}" to "${probe.now}"` : "After changing one character"}</span>
        {probe?.hash ? <HashText value={probe.hash} against={signed} /> : <code className="pc-hash pc-pending">waiting</code>}
        {probe?.hash && <span className="pc-hash-verdict">{differing} of {signed.length} characters differ</span>}
      </div>
      <p className="pc-panel-out" aria-live="polite">
        {probe?.checking && "Sending the edited email to the live API."}
        {probe?.result && (probe.result.signer ? "This sender signs only part of the body, so the change slipped past." : `The live API rejected the edited copy. ${failure(probe.result)}.`)}
        {!probe && "One changed letter changes the whole hash. Nobody can fix that without the sender's private key."}
      </p>
      {mail && computed && (
        <div className="pc-row">
          <button type="button" className="secondary" onClick={onAnother} disabled={busy}>
            Change the next character
          </button>
          {probe && (
            <button type="button" className="secondary" onClick={onRestore} disabled={busy}>
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
    <svg className={`pc-lane-svg pc-${lane}`} viewBox="0 0 340 64" role="img" aria-label={lane === "guarded" ? "Claims against the unique index" : "Claims against check, then insert"}>
      {lane === "guarded" ? <rect className="pc-gate-bar" x="170" y="4" width="5" height="56" rx="1" /> : <line className="pc-gate-open" x1="172" y1="4" x2="172" y2="60" />}
      {dots.map((d, i) => (
        <circle key={i} className={`pc-dot ${d.kind}`} r="3.2" cx="0" cy="0" style={{ transform: `translate(${d.x}px, ${d.y}px)`, transitionDelay: `${state === "settled" ? i * 14 : i * 6}ms` }} />
      ))}
    </svg>
  )
}

function Gate({ race, state }: { race: RaceResult | null; state: GateState }) {
  return (
    <div className="pc-panel pc-gate">
      <h4>Fifty claims for one record, at the same instant</h4>
      <div className="pc-lane-block">
        <p className="pc-lane-name">Aurora DSQL, one row per record</p>
        <Lane race={race} state={state} lane="guarded" />
        <p className="pc-lane-tally">
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
      <div className="pc-lane-block">
        <p className="pc-lane-name">Check, then insert</p>
        <Lane race={race} state={state} lane="naive" />
        <p className="pc-lane-tally">
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

function Claims({ first, second, released, onRelease }: { first: Claimed | null; second: Claimed | null; released: string | null; onRelease: () => void }) {
  const ok = first?.result.verdict === "VERIFIED"
  const prior = second?.result.verdict === "ALREADY_CLAIMED" ? second.result.priorClaim : null
  return (
    <div className="pc-panel pc-claims">
      <h4>The seller's screen</h4>
      <div className={`pc-order ${first ? claimTone(first) : "waiting"}`}>
        <span className="pc-order-ref">Order A12</span>
        <span className="pc-order-state">{first ? (first.result.verdict === "VERIFIED" ? `Claimed at ${clockTime(first.result.claimedAt)}` : first.result.reason) : "Waiting"}</span>
        {released ? (
          <span className="pc-released">Goods released at {clockTime(released)}</span>
        ) : (
          <button type="button" className="primary pc-release-btn" disabled={!ok} onClick={onRelease}>
            Release goods
          </button>
        )}
      </div>
      <div className={`pc-order ${second ? claimTone(second) : "waiting"}`}>
        <span className="pc-order-ref">Order A13</span>
        <span className="pc-order-state">{second ? (prior ? `Same email, already used for ${prior.claimRef} at ${clockTime(prior.createdAt)}` : second.result.reason) : "Waiting"}</span>
        <button type="button" className="primary pc-release-btn" disabled>
          Release goods
        </button>
      </div>
    </div>
  )
}

function ReceiptChain({ link, shown }: { link: ReceiptLink | null; shown: ReceiptResult | null }) {
  const r = shown?.receipt
  return (
    <div className={`pc-panel pc-chain ${shown ? (shown.verified ? "good" : "bad") : ""}`}>
      <h4>The buyer's receipt</h4>
      {link && shown && r ? (
        <>
          <div className="pc-links" aria-label="Receipt hash chain">
            <span className="pc-link pc-prev">
              <small>{r.seq > 1 ? `Entry ${r.seq - 1}` : "Start of the ledger"}</small>
              <code>{link.prevHash.slice(0, 10)}</code>
            </span>
            <span className="pc-chain-arrow" aria-hidden="true" />
            <span className="pc-link pc-this">
              <small>Entry {r.seq}, this claim</small>
              <code>{link.hash.slice(0, 10)}</code>
            </span>
          </div>
          <p className="pc-panel-out">
            {shown.verified ? "AWS KMS signed it. The server just checked the signature and the hash again." : "The receipt failed its check."} <a href={`#r=${link.id}`}>Open the receipt the buyer sees</a>
          </p>
        </>
      ) : (
        <p className="pc-panel-out">Signed by AWS KMS after the first claim, and linked to the entry before it.</p>
      )}
    </div>
  )
}
