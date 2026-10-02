import { useEffect, useState, type ReactNode } from "react"
import { Icon, type IconName } from "./Icon"

export type Tab = "counter" | "check" | "proof" | "shop"

export const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "counter", label: "Counter", icon: "counter" },
  { id: "check", label: "Check", icon: "scan" },
  { id: "proof", label: "Proof", icon: "proof" },
  { id: "shop", label: "Shop", icon: "shop" },
]

export function useMedia(query: string): boolean {
  const get = () => typeof matchMedia === "function" && matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== "function") return
    const list = matchMedia(query)
    const follow = () => setMatches(list.matches)
    list.addEventListener("change", follow)
    follow()
    return () => list.removeEventListener("change", follow)
  }, [query])
  return matches
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

function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="statusbar" aria-hidden="true">
      <span>{now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: false })}</span>
      <span className="statusbar-icons">
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}

export function Shell({ frame, tab, onTab, title, subtitle, extra, children }: { frame: "device" | "page"; tab: Tab; onTab: (t: Tab) => void; title: string; subtitle?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className={`shell ${frame}`}>
      {frame === "device" && <StatusBar />}
      <nav className="tabbar" aria-label="App">
        {frame === "page" && (
          <div className="tabbar-brand">
            <Brand />
          </div>
        )}
        {tabs.map((t) => (
          <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
        {frame === "page" && extra && <div className="tabbar-extra">{extra}</div>}
      </nav>
      <div className="screen">
        <header className="appbar">
          <div>
            <h1 className="appbar-title">{title}</h1>
            {subtitle && <p className="appbar-sub">{subtitle}</p>}
          </div>
          {frame === "page" && (
            <span className="appbar-brand">
              <Brand />
            </span>
          )}
        </header>
        <div className="screen-body">{children}</div>
      </div>
    </div>
  )
}
