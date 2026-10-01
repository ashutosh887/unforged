import { describe, expect, it } from "vitest"
import { decideBeforeClaim } from "../src/core/verdict.js"
import { formatPaise, rupeesToPaise } from "../src/core/money.js"
import type { Credit, ScreenshotRead } from "../src/core/types.js"

const read: ScreenshotRead = { readable: true, utr: "412345678901", amountPaise: 50000, payeeVpa: "shop@okhdfc", payeeName: "Shop", app: "gpay" }
const credit: Credit = { id: "c1", bank: "hdfc", utr: "412345678901", amountPaise: 50000, creditedAt: "2026-10-01T10:00:00Z", dkimDomain: "hdfcbank.net", source: "dkim-email" }

describe("decideBeforeClaim", () => {
  it("refuses to guess when the screenshot is unreadable", () => {
    expect(decideBeforeClaim({ read: { ...read, readable: false }, credit, shopVpas: [] })?.verdict).toBe("UNREADABLE")
    expect(decideBeforeClaim({ read: { ...read, utr: null }, credit, shopVpas: [] })?.verdict).toBe("UNREADABLE")
  })
  it("waits when no alert exists", () => {
    expect(decideBeforeClaim({ read, credit: null, shopVpas: [] })?.verdict).toBe("NOT_FOUND_YET")
  })
  it("catches an edited amount", () => {
    const d = decideBeforeClaim({ read: { ...read, amountPaise: 500000 }, credit, shopVpas: [] })
    expect(d?.verdict).toBe("AMOUNT_MISMATCH")
    expect(d?.reason).toContain("₹5,000")
  })
  it("catches a wrong payee", () => {
    expect(decideBeforeClaim({ read: { ...read, payeeVpa: "other@ybl" }, credit, shopVpas: ["SHOP@okhdfc"] })?.verdict).toBe("PAYEE_MISMATCH")
  })
  it("passes to the claim step when everything matches", () => {
    expect(decideBeforeClaim({ read, credit, shopVpas: ["shop@okhdfc"] })).toBeNull()
  })
})

describe("money", () => {
  it("parses rupee strings", () => {
    expect(rupeesToPaise("1,500.5")).toBe(150050)
    expect(rupeesToPaise("500")).toBe(50000)
    expect(rupeesToPaise("abc")).toBeNull()
    expect(formatPaise(150050)).toBe("₹1,500.50")
  })
})
