import { Icon } from "./Icon"
import { titles, type LiveRun, type Step } from "./live"
import { clockTime, toneIcon, type Tone } from "./parts"
import { hrefOf } from "./router"
import { Section } from "./Site"

const chipNames = ["Signature", "One letter changed", "50 claims at once", "Order A12", "Order A13", "KMS receipt"]

function chipTone(s: Step): Tone | "running" | "waiting" {
  if (s.state === "done") return s.tone
  if (s.state === "failed") return "bad"
  return s.state
}

function chipOut(s: Step): string {
  if (s.state === "done") return s.stamp
  if (s.state === "failed") return s.detail
  if (s.state === "running") return s.note ?? "Calling AWS"
  return "Queued"
}

export function ProofStrip({ live }: { live: LiveRun }) {
  const { steps, running, run } = live
  const done = steps.filter((s) => s.state === "done").length
  const failed = steps.some((s) => s.state === "failed")
  const total = steps.reduce((sum, s) => sum + (s.state === "done" ? s.ms : 0), 0)
  return (
    <section className="strip" aria-label="Live proof run">
      <div className="strip-head">
        <p className="strip-title">
          <span className={`pulse${running ? " on" : ""}`} aria-hidden="true" />
          Live run on AWS
        </p>
        <p className="strip-progress" aria-live="polite">
          {running ? `Step ${Math.min(done + 1, titles.length)} of ${titles.length}` : failed ? "Stopped" : done === titles.length ? `6 of 6 in ${(total / 1000).toFixed(1)} s` : "Starting"}
        </p>
      </div>
      <ol className="chips">
        {steps.map((s, i) => {
          const tone = chipTone(s)
          return (
            <li key={titles[i]} className={`rchip ${tone}`}>
              <span className="rchip-n">{i + 1}</span>
              <span className="rchip-name">{chipNames[i]}</span>
              <span className="rchip-out">
                {s.state === "done" && <Icon name={toneIcon[s.tone]} size={15} />}
                {chipOut(s)}
              </span>
              {s.state === "done" && <span className="rchip-ms">{s.ms} ms</span>}
            </li>
          )
        })}
      </ol>
      <div className="strip-foot">
        <a className="text" href={hrefOf.proof}>
          Open each step
        </a>
        <button type="button" className="text" onClick={() => void run()} disabled={running}>
          <Icon name="replay" size={16} /> Run again
        </button>
      </div>
    </section>
  )
}

const features = [
  { href: hrefOf.proof, title: "The proof", line: "Change one letter and the signature breaks. Fire 50 claims and one wins.", stat: "20 of 20 races, one winner" },
  { href: hrefOf.screenshots, title: "Screenshots", line: "Textract reads the UTR, amount and payee. Code gives the verdict.", stat: "10 of 10 reads right on both samples" },
  { href: hrefOf.ledger, title: "Ledger", line: "AWS KMS signs every receipt. Each one hashes the one before it.", stat: "32 receipts, 0 breaks" },
  { href: hrefOf.uses, title: "Use cases", line: "Refunds, payslips, deposits. Any email its sender signs.", stat: "37 of 37 edited emails rejected" },
]

const steps = [
  { title: "Add your bank's alert", line: "Paste the credit email. Unforged keeps it only if the bank's DKIM signature checks out." },
  { title: "Check the screenshot", line: "Textract reads the UTR and amount. Both must match a signed credit." },
  { title: "Release once", line: "Aurora DSQL lets each credit pay for one order. A reused screenshot comes back Already claimed." },
]

const judgePath: { verdict: string; tone: Tone; where: string; href: string; live: boolean }[] = [
  { verdict: "Verified", tone: "good", where: "Proof, order A12", href: hrefOf.proof, live: true },
  { verdict: "Already claimed", tone: "warn", where: "Proof, order A13", href: hrefOf.proof, live: true },
  { verdict: "Rejected, edited email", tone: "bad", where: "Proof, step 2", href: hrefOf.proof, live: true },
  { verdict: "Not found yet", tone: "neutral", where: "Screenshots, real check on a demo shop", href: hrefOf.screenshots, live: true },
  { verdict: "Unreadable", tone: "neutral", where: "Screenshots, the cropped sample", href: hrefOf.screenshots, live: true },
  { verdict: "Amount mismatch", tone: "bad", where: "Your shop, with your bank's signed alert", href: `${hrefOf.shop}/setup`, live: false },
  { verdict: "Payee mismatch", tone: "bad", where: "Your shop, with your bank's signed alert", href: `${hrefOf.shop}/setup`, live: false },
]

function SellerScreen({ live }: { live: LiveRun }) {
  const a = live.first?.result
  const b = live.second?.result
  const prior = b?.verdict === "ALREADY_CLAIMED" ? b.priorClaim : null
  return (
    <aside className="seller" aria-label="Seller's screen, from this page's live run" aria-live="polite">
      <p className="seller-head">
        <span>Seller's screen</span>
        <span className="muted">{a && b ? "Live result" : "Running"}</span>
      </p>
      <div className={`seller-order${a ? "" : " waiting"}`}>
        <div className="seller-row">
          <strong>Order A12</strong>
          <span className={`chip ${a?.verdict === "VERIFIED" ? "good" : a ? "bad" : "neutral"}`}>{a ? (a.verdict === "VERIFIED" ? "Verified" : "Rejected") : "Checking"}</span>
        </div>
        <p className="seller-line">{a?.verdict === "VERIFIED" ? `Signed by ${a.signer}, claimed at ${clockTime(a.claimedAt)}` : a ? a.reason : "Checking the signed email"}</p>
        {live.released ? (
          <p className="released">
            <Icon name="check" size={16} /> Goods released at {clockTime(live.released)}
          </p>
        ) : (
          <button type="button" className="primary" disabled>
            Release goods
          </button>
        )}
      </div>
      <div className={`seller-order${b ? "" : " waiting"}`}>
        <div className="seller-row">
          <strong>Order A13</strong>
          <span className={`chip ${b ? "warn" : "neutral"}`}>{b ? (b.verdict === "ALREADY_CLAIMED" ? "Already claimed" : b.verdict === "VERIFIED" ? "Verified" : "Rejected") : "Waiting"}</span>
        </div>
        <p className="seller-line">{prior ? `Same email. First used for ${prior.claimRef.replace(/^order /, "")} at ${clockTime(prior.createdAt)}` : b && "reason" in b ? b.reason : "The same email, shown again"}</p>
        <button type="button" className="primary" disabled>
          Release goods
        </button>
      </div>
    </aside>
  )
}

export function Home({ live }: { live: LiveRun }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Is that UPI payment real?</h1>
          <p className="hero-sub">Your bank emails you a signed alert for every credit. Unforged checks the buyer's screenshot against it, and each credit pays for one order only.</p>
          <div className="hero-actions">
            <a className="primary big-cta" href={hrefOf.proof}>
              See the proof
            </a>
            <a className="secondary big-cta" href={`${hrefOf.shop}/setup`}>
              Set up your shop
            </a>
          </div>
        </div>
        <SellerScreen live={live} />
      </section>

      <ProofStrip live={live} />

      <Section title="What it does">
        <ul className="cards four">
          {features.map((f) => (
            <li key={f.title}>
              <a className="card card-link" href={f.href}>
                <h3>{f.title}</h3>
                <p>{f.line}</p>
                <p className="card-stat">{f.stat}</p>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How a seller uses it">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-n" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.line}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Every verdict, and where to see it" sub="Five run live on this site. Two need a real bank alert in your shop.">
        <ul className="judge">
          {judgePath.map((j) => (
            <li key={j.verdict}>
              <a href={j.href} className="judge-row">
                <span className={`chip ${j.tone}`}>{j.verdict}</span>
                <span className="judge-where">{j.where}</span>
                <span className={`judge-state${j.live ? " live" : ""}`}>{j.live ? "Live now" : "Needs a bank alert"}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
