import { useEffect, useState } from "react"
import { Architecture } from "./Architecture"
import { Home } from "./Home"
import { Ledger } from "./Ledger"
import { useLiveRun } from "./live"
import { ProofCanvas } from "./ProofCanvas"
import { ReceiptPage } from "./Receipt"
import { useRoute } from "./router"
import { ShopApp } from "./Shell"
import { tokenKey } from "./Shop"
import { SignatureCheck } from "./Signature"
import { Footer, Header, PageHead } from "./Site"
import { UpiCase } from "./UpiCase"
import { UseCases } from "./UseCases"
import { LiveStatus } from "./features/LiveStatus"

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

const titles: Record<string, string> = {
  home: "Unforged",
  proof: "Proof",
  screenshots: "Screenshots",
  check: "Check an email",
  architecture: "Architecture",
  ledger: "Ledger",
  uses: "Use cases",
  status: "Status",
  shop: "Your shop",
  receipt: "Receipt",
}

export function App() {
  const route = useRoute()
  const [token, setToken] = useState(initialToken)
  const live = useLiveRun(route.page === "home" || route.page === "proof" || (route.page === "shop" && !token))

  useEffect(() => {
    document.title = route.page === "home" ? "Unforged" : `${titles[route.page]} | Unforged`
  }, [route.page])

  useEffect(() => {
    if (new URLSearchParams(location.hash.slice(1)).has("t")) history.replaceState(null, "", "#/shop")
  }, [])

  const visitLedger = live.shown?.receipt.ledger

  return (
    <div className={`site page-${route.page}`}>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById("main")?.focus()
        }}
      >
        Skip to content
      </a>
      <Header page={route.page} />
      <main id="main" className="wrap" tabIndex={-1}>
        {route.page === "home" && <Home live={live} />}
        {route.page === "proof" && (
          <>
            <PageHead title="The proof, live" sub="A real signed email through the live stack. Click any letter in the body to break it." />
            <ProofCanvas live={live} />
          </>
        )}
        {route.page === "screenshots" && <UpiCase />}
        {route.page === "check" && (
          <>
            <PageHead title="Check an email" sub="Paste any email's raw source. See who signed it, break it, claim it once. Nothing you paste is stored." />
            <SignatureCheck sample={sampleEmail} />
          </>
        )}
        {route.page === "architecture" && <Architecture />}
        {route.page === "ledger" && <Ledger ledger={route.arg} visitLedger={visitLedger} />}
        {route.page === "uses" && <UseCases />}
        {route.page === "status" && (
          <>
            <PageHead title="Status" sub="The deployed stack, checked when you open this page. The API caches the result for 60 s." />
            <LiveStatus title="Live stack" />
          </>
        )}
        {route.page === "shop" && <ShopApp token={token} onToken={setToken} live={live} start={route.arg === "setup" ? "shop" : "counter"} />}
        {route.page === "receipt" && <ReceiptPage id={route.arg} />}
      </main>
      <Footer />
    </div>
  )
}
