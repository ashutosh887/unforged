import type { RaceResult } from "./api"
import { Icon } from "./Icon"
import { titles, type LiveRun, type Mail, type Edit, type Step } from "./live"
import { toneIcon } from "./parts"

export function Theater({ live, onOwn }: { live: LiveRun; onOwn?: () => void }) {
  const { mail, edit, steps, race, running, run } = live
  const finished = steps.filter((s) => s.state === "done").length
  return (
    <section className="log" aria-label="Live run against the AWS stack">
      <div className="log-head">
        <h2>Live run, calling AWS from this page</h2>
        <p className="log-progress" aria-live="polite">
          {running ? `Step ${Math.min(finished + 1, titles.length)} of ${titles.length}` : steps.some((s) => s.state === "failed") ? "Stopped" : finished === titles.length ? `${titles.length} of ${titles.length} done` : "Ready"}
        </p>
      </div>
      <MailCard mail={mail} edit={edit} />
      <ol className="log-steps">
        {titles.map((title, i) => (
          <LogStep key={title} title={title} step={steps[i]!} race={i === 2 ? race : null} />
        ))}
      </ol>
      <div className="log-foot">
        <button type="button" className="secondary" onClick={() => void run()} disabled={running}>
          <Icon name="replay" size={18} /> {running ? "Running on AWS" : "Run it again"}
        </button>
        {onOwn ? (
          <button type="button" className="text" onClick={onOwn}>
            Try it with your own email
          </button>
        ) : (
          <a className="text" href="#own">
            Try it with your own email
          </a>
        )}
      </div>
    </section>
  )
}

function LogStep({ title, step, race }: { title: string; step: Step; race: RaceResult | null }) {
  const tone = step.state === "done" ? step.tone : step.state === "failed" ? "bad" : "neutral"
  return (
    <li className={`lstep ${step.state} ${tone}`}>
      <span className="lstep-mark" aria-hidden="true">
        {step.state === "done" || step.state === "failed" ? <Icon name={step.state === "failed" ? "cross" : toneIcon[step.tone]} size={16} /> : null}
      </span>
      <div className="lstep-main">
        <div className="lstep-row">
          <span className="lstep-title">{title}</span>
          {step.state === "done" && <span className="lstep-ms">{step.ms} ms</span>}
          {step.state === "running" && <span className="lstep-live">Calling AWS</span>}
        </div>
        {step.state === "done" && (
          <>
            <p className={`lstep-stamp ${step.tone}`}>{step.stamp}</p>
            <p className="lstep-detail">{step.detail}</p>
            {step.link && (
              <a className="text" href={step.link.href}>
                <Icon name="receipt" size={16} /> {step.link.label}
              </a>
            )}
          </>
        )}
        {step.state === "failed" && <p className="lstep-detail error">{step.detail}</p>}
        {race && <RaceGrid race={race} />}
      </div>
    </li>
  )
}

export function MailCard({ mail, edit }: { mail: Mail | null; edit: Edit | null }) {
  return (
    <figure className="mail" aria-label="The signed email being checked">
      <figcaption>
        <span className="mail-from">{mail?.from || "Loading a signed email"}</span>
        {mail?.subject && <span className="mail-subject">{mail.subject}</span>}
        {mail && (
          <span className="mail-sig">
            <Icon name="lock" size={14} /> DKIM d={mail.domain} s={mail.selector}
          </span>
        )}
      </figcaption>
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
      <p className="mail-note">A real message from a public mailing-list archive. It stands in for a bank alert here, and the check is the same. Each visit gets its own ledger.</p>
    </figure>
  )
}

function RaceGrid({ race }: { race: RaceResult }) {
  const guarded = Array.from({ length: race.n }, (_, i) => (i < race.guarded.verified ? "win" : i < race.guarded.verified + race.guarded.alreadyClaimed ? "bounce" : "err"))
  const naive = Array.from({ length: race.n }, (_, i) => (i < race.naive.accepted ? (i === 0 ? "win" : "double") : "bounce"))
  return (
    <div className="race-grid">
      <div className="lane">
        <span className="lane-label">Unique index, {race.guarded.verified} accepted</span>
        <div className="cells">
          {guarded.map((c, i) => (
            <i key={i} className={`cell ${c}`} style={{ animationDelay: `${i * 14}ms` }} />
          ))}
        </div>
      </div>
      <div className="lane">
        <span className="lane-label">Check, then insert, {race.naive.accepted} accepted</span>
        <div className="cells">
          {naive.map((c, i) => (
            <i key={i} className={`cell ${c}`} style={{ animationDelay: `${i * 14}ms` }} />
          ))}
        </div>
      </div>
      <p className="lane-key">
        <span>
          <i className="cell win" /> approved once
        </span>
        <span>
          <i className="cell bounce" /> refused as already claimed
        </span>
        <span>
          <i className="cell double" /> approved again, a double spend
        </span>
      </p>
    </div>
  )
}
