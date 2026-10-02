import { useEffect, useState } from "react"

export type Page = "home" | "proof" | "screenshots" | "check" | "architecture" | "ledger" | "uses" | "status" | "shop"
export type Route = { page: Page; arg?: string } | { page: "receipt"; arg: string }

const paths: Record<string, Page> = {
  "": "home",
  proof: "proof",
  screenshots: "screenshots",
  check: "check",
  architecture: "architecture",
  ledger: "ledger",
  "use-cases": "uses",
  status: "status",
  shop: "shop",
}

export const hrefOf: Record<Page, string> = {
  home: "#/",
  proof: "#/proof",
  screenshots: "#/screenshots",
  check: "#/check",
  architecture: "#/architecture",
  ledger: "#/ledger",
  uses: "#/use-cases",
  status: "#/status",
  shop: "#/shop",
}

const receiptPattern = /^[0-9A-Za-z]{22}$/

function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export function parse(hash: string): Route {
  if (hash.startsWith("#/")) {
    const [head = "", arg] = hash.slice(2).split("/")
    if (head === "receipt" && arg && receiptPattern.test(arg)) return { page: "receipt", arg }
    const page = Object.hasOwn(paths, head) ? paths[head]! : "home"
    return arg ? { page, arg: decoded(arg) } : { page }
  }
  const params = new URLSearchParams(hash.slice(1))
  const r = params.get("r")
  if (r && receiptPattern.test(r)) return { page: "receipt", arg: r }
  if (params.has("t") || params.has("app")) return { page: "shop" }
  return { page: "home" }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const follow = () => {
      setRoute(parse(location.hash))
      scrollTo({ top: 0 })
    }
    addEventListener("hashchange", follow)
    return () => removeEventListener("hashchange", follow)
  }, [])
  return route
}
