import { describe, expect, it } from "vitest"
import { toRead } from "../src/core/read.js"

describe("toRead", () => {
  it("normalises model output", () => {
    expect(toRead({ readable: true, utr: "4123 4567 8901", amount: "₹1,250.50", payeeVpa: " shop@okhdfc ", payeeName: "Shop", app: "GPay" })).toEqual({ readable: true, utr: "412345678901", amountPaise: 125050, payeeVpa: "shop@okhdfc", payeeName: "Shop", app: "gpay" })
  })
  it("marks a short UTR unreadable instead of guessing", () => {
    expect(toRead({ readable: true, utr: "41234567", amount: "500" }).readable).toBe(false)
  })
  it("treats an empty tool call as unreadable", () => {
    expect(toRead({}).readable).toBe(false)
  })
})
