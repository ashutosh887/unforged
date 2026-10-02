import { useEffect, useState, type ReactNode } from "react"
import { AliveDot } from "./features/LiveStatus"
import { Icon } from "./Icon"
import { hrefOf, type Page } from "./router"

const repo = "https://github.com/ashutosh887/unforged"
const doc = (path: string) => `${repo}/blob/main/${path}`

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
      { label: "GitHub repo", href: repo },
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
            <p>The screenshot was never the proof.</p>
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
          <span>Built on AWS for Zero to Shipped</span>
          <span>us-east-1</span>
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
