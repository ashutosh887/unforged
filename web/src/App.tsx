import { useEffect, useState } from "react"
import { CheckScreen } from "./Check"
import { DemoCounter, ShopCounter } from "./Counter"
import { Demo } from "./Demo"
import { useLiveRun, type LiveRun } from "./live"
import { Race } from "./parts"
import { ReceiptPage, receiptIdFromHash } from "./Receipt"
import { Brand, Shell, useMedia, type Tab } from "./Shell"
import { AlertBox, ShopLink, ShopSetup, tokenKey } from "./Shop"
import { SignatureCheck } from "./Signature"
import { Theater } from "./Theater"
import { UpiCase } from "./UpiCase"

const sampleEmail = {
  label: "Use a sample signed email",
  load: async () => {
    const res = await fetch("/samples/sample.eml", { cache: "no-cache" }).catch(() => null)
    if (!res?.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null
    return res.text()
  },
}

function initialToken(): string {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("t")
  if (fromHash) {
    try {
      localStorage.setItem(tokenKey, fromHash)
    } catch {}
    return fromHash
  }
  try {
    return localStorage.getItem(tokenKey) ?? ""
  } catch {
    return ""
  }
}

function initialAppMode(token: string): boolean {
  const hash = new URLSearchParams(location.hash.slice(1))
  if (hash.has("try")) return false
  return Boolean(token) || hash.has("app")
}

const titles: Record<Tab, string> = { counter: "Counter", check: "Check a payment", proof: "How it works", shop: "Your shop" }

export function App() {
  const [token, setToken] = useState(initialToken)
  const [receiptId, setReceiptId] = useState(receiptIdFromHash)
  const [appMode, setAppMode] = useState(() => initialAppMode(token))
  const [tab, setTab] = useState<Tab>("counter")
  const [version, setVersion] = useState(0)
  const wide = useMedia("(min-width: 1080px)")
  const live = useLiveRun(!receiptId && (!token || tab === "proof"))

  useEffect(() => {
    const follow = () => {
      setReceiptId(receiptIdFromHash())
      const hash = new URLSearchParams(location.hash.slice(1))
      if (hash.has("try")) setAppMode(false)
      if (hash.has("app")) setAppMode(true)
    }
    addEventListener("hashchange", follow)
    return () => removeEventListener("hashchange", follow)
  }, [])

  const goOwn = () => {
    setTab("proof")
    requestAnimationFrame(() => document.getElementById("own")?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  if (receiptId) {
    return (
      <div className="receipt-page">
        <header className="topbar">
          <a href="#try" className="brand-link">
            <Brand />
          </a>
        </header>
        <main>
          <ReceiptPage id={receiptId} />
          <a className="text" href="#try">
            See how Unforged checks a payment
          </a>
        </main>
      </div>
    )
  }

  const changed = () => setVersion((v) => v + 1)
  const screen = (frame: "device" | "page") => (
    <Shell
      frame={frame}
      tab={tab}
      onTab={setTab}
      title={tab === "counter" && !token ? "Demo counter" : titles[tab]}
      subtitle={tab === "counter" ? (token ? "Signed bank credits for your shop" : "This visit's ledger") : undefined}
      extra={
        <a className="text small" href="#try">
          About Unforged
        </a>
      }
    >
      {tab === "counter" &&
        (token ? <ShopCounter token={token} version={version} onCheck={() => setTab("check")} /> : <DemoCounter live={live} onCheck={() => setTab("check")} onProof={() => setTab("proof")} />)}
      {tab === "check" && <CheckScreen token={token} onDone={changed} onShop={() => setTab("shop")} />}
      {tab === "proof" && (frame === "device" ? <Theater live={live} /> : <ProofScreen live={live} onOwn={goOwn} onShop={() => setTab("shop")} />)}
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
              setToken(t)
              setAppMode(true)
              setTab("counter")
            }}
          />
        ))}
    </Shell>
  )

  if (appMode || !wide) return <div className="app-page">{screen("page")}</div>

  return (
    <div className="landing">
      <header className="topbar">
        <Brand />
        <nav aria-label="Page">
          <a className="text" href="#how">
            How screenshots are read
          </a>
          <a className="text" href="#own">
            Try your own email
          </a>
          <a className="primary" href="#app">
            Open the app
          </a>
        </nav>
      </header>
      <section className="stage">
        <div className="stage-copy">
          <h1>Check the payment, not the screenshot.</h1>
          <p className="lede">
            A buyer can edit a UPI screenshot, or show the same one for two orders. Unforged checks it against your bank's signed credit alert, and lets each credit pay for one order.
          </p>
          <Theater live={live} />
        </div>
        <div className="stage-device">
          <div className="device">{screen("device")}</div>
        </div>
      </section>
      <section className="band" id="how">
        <UpiCase onShop={() => (location.hash = "app")} />
      </section>
      <section className="band" id="own">
        <SignatureCheck sample={sampleEmail} />
        <Demo />
      </section>
      <footer className="foot">
        <p>Runs on CloudFront, API Gateway, Lambda, Aurora DSQL, Amazon Textract, Amazon Bedrock and AWS KMS in us-east-1.</p>
      </footer>
    </div>
  )
}

function ProofScreen({ live, onOwn, onShop }: { live: LiveRun; onOwn: () => void; onShop: () => void }) {
  return (
    <div className="proof">
      <div className="proof-intro">
        <h2>Check the payment, not the screenshot.</h2>
        <p>
          A buyer can edit a UPI screenshot, or show the same one for two orders. Unforged checks it against your bank's signed credit alert, and lets each credit pay for one order.
        </p>
      </div>
      <Theater live={live} onOwn={onOwn} />
      <UpiCase onShop={onShop} />
      <div id="own">
        <SignatureCheck sample={sampleEmail} />
      </div>
      <Demo />
    </div>
  )
}
