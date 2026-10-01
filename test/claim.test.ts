import { describe, expect, it } from "vitest"
import { claim, withRetry } from "../src/core/claim.js"
import type { Conn, Pool } from "../src/db/client.js"
import type { ScreenshotRead } from "../src/core/types.js"

const read: ScreenshotRead = { readable: true, utr: "4123 4567 8901", amountPaise: 50000, payeeVpa: "shop@okhdfc", payeeName: "Shop", app: "gpay" }
const creditRow = { id: "c1", bank: "hdfc", utr: "412345678901", amount_paise: "50000", credited_at: new Date("2026-10-01T04:30:00Z"), source: "dkim-email", dkim_domain: "hdfcbank.net" }

function fakePool(insertErrors: unknown[]): Pool & { inserts: number } {
  const claims: { order_ref: string; created_at: Date }[] = []
  const pool = {
    inserts: 0,
    async query(text: string) {
      if (text.startsWith("SELECT id, bank")) return { rows: [creditRow], rowCount: 1 }
      if (text.startsWith("SELECT order_ref")) return { rows: claims, rowCount: claims.length }
      return { rows: [], rowCount: 0 }
    },
    async connect(): Promise<Conn> {
      return {
        release() {},
        async query(text: string, values?: unknown[]) {
          if (text.startsWith("INSERT")) {
            pool.inserts++
            const err = insertErrors.shift()
            if (err) throw err
            claims.push({ order_ref: String(values?.[2]), created_at: new Date("2026-10-01T05:00:00Z") })
          }
          return { rows: [], rowCount: 0 }
        },
      }
    },
  }
  return pool as Pool & { inserts: number }
}

const input = { shopId: "s1", shopVpas: ["shop@okhdfc"], read, orderRef: "A-1", screenshotSha256: "x" }

describe("claim", () => {
  it("verifies a first claim", async () => {
    expect((await claim(fakePool([]), input)).verdict).toBe("VERIFIED")
  })
  it("retries an optimistic concurrency conflict", async () => {
    const pool = fakePool([{ code: "OC000" }])
    let retries = 0
    expect((await claim(pool, input, () => retries++)).verdict).toBe("VERIFIED")
    expect(retries).toBe(1)
  })
  it("reports the earlier order when the credit is reused", async () => {
    const pool = fakePool([])
    await claim(pool, input)
    const pool2 = { ...pool, connect: fakePool([{ code: "23505" }]).connect }
    const d = await claim(pool2, { ...input, orderRef: "B-2" })
    expect(d.verdict).toBe("ALREADY_CLAIMED")
    expect(d.priorClaim?.orderRef).toBe("A-1")
  })
  it("stops the claim before insert when the amount is wrong", async () => {
    const pool = fakePool([])
    expect((await claim(pool, { ...input, read: { ...read, amountPaise: 1 } })).verdict).toBe("AMOUNT_MISMATCH")
    expect(pool.inserts).toBe(0)
  })
})

describe("withRetry", () => {
  it("gives up on non-conflict errors at once", async () => {
    let n = 0
    await expect(withRetry(async () => { n++; throw { code: "23505" } })).rejects.toMatchObject({ code: "23505" })
    expect(n).toBe(1)
  })
})
