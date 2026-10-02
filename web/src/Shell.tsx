import { useState } from "react"
import { CheckScreen } from "./Check"
import { DemoCounter, ShopCounter } from "./Counter"
import { Icon, type IconName } from "./Icon"
import type { LiveRun } from "./live"
import { Race } from "./parts"
import { hrefOf } from "./router"
import { AlertBox, ShopLink, ShopSetup } from "./Shop"

export type Tab = "counter" | "check" | "shop"

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "counter", label: "Counter", icon: "counter" },
  { id: "check", label: "Check", icon: "scan" },
  { id: "shop", label: "Shop", icon: "shop" },
]

export function ShopApp({ token, onToken, live, start }: { token: string; onToken: (t: string) => void; live: LiveRun; start: Tab }) {
  const [tab, setTab] = useState<Tab>(start)
  const [version, setVersion] = useState(0)
  const changed = () => setVersion((v) => v + 1)
  const title = tab === "counter" ? (token ? "Counter" : "Demo counter") : tab === "check" ? "Check a payment" : token ? "Your shop" : "Set up your shop"
  const sub = tab === "counter" ? (token ? "Signed bank credits for your shop" : "A public signed email stands in for your bank's alert") : undefined
  return (
    <div className="app">
      <header className="app-head">
        <div>
          <h1>{title}</h1>
          {sub && <p className="app-sub">{sub}</p>}
        </div>
        <nav className="app-tabs" aria-label="Shop">
          {tabs.map((t) => (
            <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <div className="app-body">
        {tab === "counter" && (token ? <ShopCounter token={token} version={version} onCheck={() => setTab("check")} /> : <DemoCounter live={live} onCheck={() => setTab("check")} proofHref={hrefOf.proof} />)}
        {tab === "check" && <CheckScreen token={token} onDone={changed} onShop={() => setTab("shop")} />}
        {tab === "shop" &&
          (token ? (
            <>
              <ShopLink token={token} />
              <AlertBox token={token} onDone={changed} />
              <Race />
            </>
          ) : (
            <ShopSetup
              onToken={(t) => {
                onToken(t)
                setTab("counter")
              }}
            />
          ))}
      </div>
    </div>
  )
}
