import { useEffect, useState } from "react"
import type { Verdict } from "../../src/core/types.js"
import { post, type LedgerResult } from "./api"
import { Aloud, spellOrder, type Spoken } from "./Aloud"
import { Icon } from "./Icon"
import { orders, type Done, type LiveRun, type Step } from "./live"
import { clockTime, money, Panel, ReleaseAction, toneIcon, utrGroups, verdicts } from "./parts"

const feedNames = ["Signature checked", "One character changed", "50 claims at once", "", "", "Buyer's receipt countersigned"]

function claimTitle(step: Done): string {
  if (!step.claim) return step.stamp
  return step.claim.verdict === "VERIFIED" ? "Verified" : step.claim.verdict === "ALREADY_CLAIMED" ? "Already claimed" : "Rejected"
}

function claimLine(step: Done): string {
  const c = step.claim
  if (!c) return step.detail
  if (c.verdict === "VERIFIED") return `Signed by ${c.signer}. Claimed once, at ${clockTime(c.claimedAt)}. Release the goods.`
  if (c.verdict === "ALREADY_CLAIMED") return `This email already paid for ${c.priorClaim.claimRef} at ${clockTime(c.priorClaim.createdAt)}. Don't release.`
  return c.reason
}

function OrderPanel({ order, step }: { order: string; step: Step }) {
  const label = order.replace(/^order /, "Order ")
  if (step.state === "running") {
    return (
      <div className="panel pending" aria-busy="true">
        <div className="panel-top">
          <p className="panel-kicker">{label}</p>
          <p className="panel-wait">Checking the signature and claiming it in Aurora DSQL</p>
        </div>
      </div>
    )
  }
  if (step.state !== "done") return null
  const release = step.release
  return (
    <Panel
      tone={step.tone}
      kicker={label}
      title={claimTitle(step)}
      line={claimLine(step)}
      action={
        release && (
          <ReleaseAction state={release.state === "pressed" ? { kind: "done", text: `${release.text}, ${label}` } : release.state === "blocked" ? { kind: "blocked", reason: release.reason } : { kind: "open" }} />
        )
      }
    >
      <dl className="facts">
        <dt>Record</dt>
        <dd>Signed email{step.claim && "signer" in step.claim ? ` from ${step.claim.signer}` : ""}</dd>
        <dt>Answered in</dt>
        <dd>{step.ms} ms</dd>
      </dl>
    </Panel>
  )
}

export function DemoCounter({ live, onCheck, onProof }: { live: LiveRun; onCheck: () => void; onProof: () => void }) {
  const { steps, receipt } = live
  const claims = [4, 3].map((i) => ({ order: orders[i - 3]!, step: steps[i]! }))
  const anyClaim = claims.some((c) => c.step.state !== "waiting")
  const checks = [0, 1, 2, 5].map((i) => ({ i, step: steps[i]! })).filter((c) => c.step.state !== "waiting")
  const spoken: Spoken[] = claims.flatMap(({ step }) =>
    step.state === "done" && step.claim?.verdict === "VERIFIED" ? [{ id: `${step.claim.claimRef}-${step.claim.claimedAt}`, text: `Payment verified for order ${spellOrder(step.claim.claimRef)}. Signed by ${step.claim.signer}.` }] : [],
  )
  return (
    <div className="counter">
      <p className="counter-note">
        A public signed email stands in for your bank's alert. Every check here calls the live AWS stack.
      </p>
      <Aloud items={spoken} />
      <div className="orders" aria-live="polite">
        {anyClaim ? (
          claims.map((c) => <OrderPanel key={c.order} order={c.order} step={c.step} />)
        ) : (
          <div className="incoming">
            <p className="incoming-label">
              <Icon name="lock" size={15} /> Incoming signed record
            </p>
            <p className="incoming-from">{live.mail?.from || "Loading a signed email"}</p>
            {live.mail && <p className="incoming-sig">DKIM d={live.mail.domain}, checking now</p>}
            <p className="incoming-next">Next it pays for order A12. Then someone tries it again for order A13.</p>
          </div>
        )}
      </div>
      {checks.length > 0 && (
        <section className="feed" aria-label="Checks on this visit">
          <h3 className="feed-title">Checks on this visit</h3>
          <ul>
            {checks.map(({ i, step }) => (
              <li key={i} className={`feed-row ${step.state === "done" ? step.tone : step.state}`}>
                <span className="feed-mark" aria-hidden="true">
                  {step.state === "done" ? <Icon name={toneIcon[step.tone]} size={16} /> : step.state === "failed" ? <Icon name="cross" size={16} /> : null}
                </span>
                <span className="feed-main">
                  <span className="feed-name">{feedNames[i]}</span>
                  <span className="feed-sub">{step.state === "done" ? step.stamp : step.state === "failed" ? step.detail : "Calling AWS"}</span>
                </span>
                {step.state === "done" && <span className="feed-ms">{step.ms} ms</span>}
              </li>
            ))}
          </ul>
          {receipt && (
            <a className="row-link" href={`#r=${receipt.id}`}>
              <Icon name="receipt" size={18} />
              <span>Open the receipt the buyer gets for order A12</span>
            </a>
          )}
          <button type="button" className="text" onClick={onProof}>
            See every step with its timing
          </button>
        </section>
      )}
      <CheckBar onCheck={onCheck} />
    </div>
  )
}

export function CheckBar({ onCheck }: { onCheck: () => void }) {
  return (
    <div className="checkbar">
      <button type="button" className="primary big" onClick={onCheck}>
        <Icon name="scan" size={22} /> Check a payment
      </button>
    </div>
  )
}

export function ShopCounter({ token, version, onCheck }: { token: string; version: number; onCheck: () => void }) {
  const [ledger, setLedger] = useState<LedgerResult | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let live = true
    post<LedgerResult>("ledger", {}, token)
      .then((data) => live && (setLedger(data), setError("")))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [token, version])

  if (error) return <p className="error">{error}</p>
  if (!ledger) return <p className="muted">Loading your counter</p>

  const claimed = ledger.credits.filter((c) => c.claim).length
  const total = ledger.credits.reduce((sum, c) => sum + c.amountPaise, 0)
  const spoken: Spoken[] = ledger.credits.map((c) => ({ id: c.id, text: `${money(c.amountPaise)} received. Signed by ${c.dkimDomain}.` }))
  return (
    <div className="counter">
      <Aloud items={spoken} />
      <section className="summary" aria-label="Signed credits">
        <p className="summary-amount">{money(total)}</p>
        <p className="summary-sub">
          in {ledger.credits.length} signed credit{ledger.credits.length === 1 ? "" : "s"}, {claimed} claimed, {ledger.credits.length - claimed} open
        </p>
        <p className="summary-vpa">Paid on {ledger.shop.vpas.join(", ")}</p>
      </section>
      <section className="feed" aria-label="Signed bank credits">
        <h3 className="feed-title">Bank credits</h3>
        {ledger.credits.length === 0 ? (
          <div className="empty">
            <Icon name="lock" size={22} />
            <p>No signed bank alerts yet. Add your bank's credit alert in Shop, then check the buyer's screenshot.</p>
          </div>
        ) : (
          <ul>
            {ledger.credits.map((c) => (
              <li key={c.id} className={`credit ${c.claim ? "spent" : "open"}`}>
                <span className="credit-amount">{money(c.amountPaise)}</span>
                <span className="credit-meta">
                  <span>
                    {c.bank.toUpperCase()}, {clockTime(c.creditedAt)}
                  </span>
                  <span className="credit-signer">
                    <Icon name="lock" size={13} /> Signed by {c.dkimDomain}
                  </span>
                  <span className="num">UTR {utrGroups(c.utr)}</span>
                </span>
                <span className={`chip ${c.claim ? "warn" : "good"}`}>{c.claim ? `Claimed, order ${c.claim.orderRef}` : "Open"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {ledger.attempts.length > 0 && (
        <section className="feed" aria-label="Recent checks">
          <h3 className="feed-title">Recent checks</h3>
          <ul>
            {ledger.attempts.map((a, i) => {
              const v = verdicts[a.verdict as Verdict]
              return (
                <li key={`${a.createdAt}-${i}`} className={`feed-row ${v?.tone ?? "neutral"}`}>
                  <span className="feed-mark" aria-hidden="true">
                    <Icon name={toneIcon[v?.tone ?? "neutral"]} size={16} />
                  </span>
                  <span className="feed-main">
                    <span className="feed-name">{v?.label ?? a.verdict}</span>
                    <span className="feed-sub">{a.reason}</span>
                  </span>
                  <span className="feed-ms">
                    {a.alertOnly ? "Alert" : "Screenshot"}, {clockTime(a.createdAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <CheckBar onCheck={onCheck} />
    </div>
  )
}
