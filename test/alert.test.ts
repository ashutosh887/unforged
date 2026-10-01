import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { dkimSign } from "mailauth/lib/dkim/sign.js"
import { extractCredit, verifyAlert } from "../src/core/alert.js"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const p = publicKey.export({ type: "spki", format: "der" }).toString("base64")

const resolver = async (name: string) => {
  if (name.endsWith("._domainkey.hdfcbank.net") || name.endsWith("._domainkey.evil.example")) return [[`v=DKIM1; k=rsa; p=${p}`]]
  throw Object.assign(new Error("not found"), { code: "ENOTFOUND" })
}

const body = "Dear Customer, Rs.500.00 has been credited to your account **1234 by VPA buyer@okaxis on 01-10-26. Your UPI transaction reference number is 412345678901."

function message(from: string, text = body) {
  return [`From: HDFC Bank InstaAlerts <${from}>`, "To: shop@example.com", "Subject: You have received money", "Date: Wed, 01 Oct 2026 10:00:00 +0530", "Content-Type: text/plain; charset=utf-8", "", text, ""].join("\r\n")
}

async function signed(from: string, domain: string, text?: string) {
  const raw = message(from, text)
  const { signatures } = await dkimSign(raw, { signingDomain: domain, selector: "s1", privateKey: pem, signatureData: [{ signingDomain: domain, selector: "s1", privateKey: pem }] })
  return signatures + raw
}

describe("verifyAlert", () => {
  it("accepts a signed alert from an allowlisted bank", async () => {
    const r = await verifyAlert(await signed("alerts@hdfcbank.net", "hdfcbank.net"), resolver)
    expect(r).toEqual({ ok: true, alert: { bank: "hdfc", utr: "412345678901", amountPaise: 50000, creditedAt: "2026-10-01T04:30:00.000Z", dkimDomain: "hdfcbank.net", source: "dkim-email" } })
  })
  it("rejects an alert edited after signing", async () => {
    const raw = (await signed("alerts@hdfcbank.net", "hdfcbank.net")).replace("Rs.500.00", "Rs.5000.00")
    expect(await verifyAlert(raw, resolver)).toMatchObject({ ok: false })
  })
  it("rejects an unsigned alert", async () => {
    expect(await verifyAlert(message("alerts@hdfcbank.net"), resolver)).toMatchObject({ ok: false })
  })
  it("rejects a sender off the allowlist", async () => {
    expect(await verifyAlert(await signed("alerts@evil.example", "evil.example"), resolver)).toMatchObject({ ok: false, reason: expect.stringContaining("allowlist") })
  })
  it("rejects a bank From signed by another domain", async () => {
    expect(await verifyAlert(await signed("alerts@hdfcbank.net", "evil.example"), resolver)).toMatchObject({ ok: false, reason: expect.stringContaining("DKIM") })
  })
})

describe("extractCredit", () => {
  it("ignores debit alerts", () => {
    expect(extractCredit("Rs.500.00 has been debited. UPI reference 412345678901")).toBeNull()
  })
  it("reads INR amounts with grouping", () => {
    expect(extractCredit("INR 1,250.50 credited. UTR No. 512345678901")).toEqual({ amountPaise: 125050, utr: "512345678901" })
  })
})
