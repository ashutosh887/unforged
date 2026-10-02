import { useEffect, useState, type ReactNode } from "react"
import { AliveDot } from "./features/LiveStatus"
import { Icon } from "./Icon"
import { hrefOf, type Page } from "./router"

const author = "https://github.com/ashutosh887"
const repo = `${author}/unforged`
const doc = (path: string) => `${repo}/blob/main/${path}`

export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg className="gh-mark" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      Unforged
    </span>
  )
}

const nav: { page: Page; label: string }[] = [
  { page: "proof", label: "Proof" },
  { page: "screenshots", label: "Screenshots" },
  { page: "architecture", label: "Architecture" },
  { page: "check", label: "Check an email" },
]

export function Header({ page }: { page: Page | "receipt" }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [page])
  return (
    <header className="site-head">
      <div className="wrap site-head-row">
        <a href={hrefOf.home} className="brand-link" aria-label="Unforged home">
          <Brand />
        </a>
        <nav id="site-nav" className={`site-nav${open ? " open" : ""}`} aria-label="Main">
          {nav.map((n) => (
            <a key={n.page} href={hrefOf[n.page]} aria-current={page === n.page ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <a className="site-source" href={repo} target="_blank" rel="noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub">
          <GitHubMark size={20} />
        </a>
        <a className={`primary site-cta${page === "shop" ? " here" : ""}`} href={hrefOf.shop} aria-current={page === "shop" ? "page" : undefined}>
          Your shop
        </a>
        <button type="button" className="site-menu" aria-expanded={open} aria-controls="site-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} size={22} />
        </button>
      </div>
    </header>
  )
}

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Proof", href: hrefOf.proof },
      { label: "Screenshots", href: hrefOf.screenshots },
      { label: "Check an email", href: hrefOf.check },
      { label: "Your shop", href: hrefOf.shop },
    ],
  },
  {
    title: "How it works",
    links: [
      { label: "Architecture", href: hrefOf.architecture },
      { label: "Ledger", href: hrefOf.ledger },
      { label: "Use cases", href: hrefOf.uses },
      { label: "Status", href: hrefOf.status },
    ],
  },
  {
    title: "Source",
    links: [
      { label: "Source code", href: repo },
      { label: "README", href: `${repo}#readme` },
      { label: "how-it-works.md", href: doc("docs/how-it-works.md") },
      { label: "threat-model.md", href: doc("docs/threat-model.md") },
      { label: "verify-yourself.md", href: doc("docs/verify-yourself.md") },
    ],
  },
]

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Brand />
            <p>Checks UPI payments against your bank's signed alert.</p>
            <p>
              Built by{" "}
              <a href={author} target="_blank" rel="noreferrer">
                @ashutosh887
              </a>
              . Source on{" "}
              <a href={repo} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </div>
          {columns.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2>{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="foot-base">
          <span>
            Made by{" "}
            <a href={author} target="_blank" rel="noreferrer">
              ashutosh887
            </a>{" "}
            for AWS Builder Center Zero to Shipped, 2026
          </span>
          <span>Live on AWS, us-east-1</span>
          <a className="foot-gh" href={repo} target="_blank" rel="noreferrer">
            <GitHubMark size={14} />
            github.com/ashutosh887/unforged
          </a>
          <a href={hrefOf.status} className="foot-status">
            <AliveDot />
          </a>
        </div>
      </div>
    </footer>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

export function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="section-head">
        <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </section>
  )
}

export function Why({ children, label = "Why" }: { children: ReactNode; label?: string }) {
  return (
    <details className="why">
      <summary>{label}</summary>
      <div className="why-body">{children}</div>
    </details>
  )
}
