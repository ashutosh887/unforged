import { intEnv, meta, percentile, post, fmtMs, table, writeResult } from "./lib.js"

type Sig = { domain: string; result: string; aligned: boolean; detail: string | null }
type Verify = { from: string | null; signer: string | null; signatures?: Sig[]; notStoredBecause: string | null; bankCredit: unknown }

const source = process.env.MBOX_URL ?? "https://lists.gnu.org/archive/mbox/help-gnu-emacs/2026-09"
const limit = intEnv("LIMIT", 80)

function messages(mbox: string): string[] {
  return mbox
    .split(/\n(?=From \S+ +\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4}\n)/)
    .map((m) => m.replace(/^From [^\n]*\n/, "").replace(/\n>From /g, "\nFrom "))
    .filter((m) => /^dkim-signature:/im.test(m))
}

function bodyStart(raw: string): number {
  const at = raw.indexOf("\n\n")
  return at < 0 ? -1 : at + 2
}

function oneCharacter(raw: string): string | null {
  const start = bodyStart(raw)
  if (start < 0) return null
  const offset = raw.slice(start).search(/[0-9A-Za-z]/)
  if (offset < 0) return null
  const at = start + offset
  const was = raw[at]!
  const now = /[0-9]/.test(was) ? String((Number(was) + 1) % 10) : was === "z" ? "a" : was === "Z" ? "A" : String.fromCharCode(was.charCodeAt(0) + 1)
  return raw.slice(0, at) + now + raw.slice(at + 1)
}

function bankFrom(raw: string): string | null {
  const swapped = raw.replace(/^From:[^\n]*(\n[ \t][^\n]*)*/im, "From: InstaAlerts <alerts@hdfcbank.net>")
  return swapped === raw ? null : swapped
}

const res = await fetch(source)
if (!res.ok) {
  console.error(`could not fetch ${source}: HTTP ${res.status}`)
  process.exit(1)
}
const all = messages((await res.text()).replace(/\r\n/g, "\n")).slice(0, limit)
const info = meta()

const results: { i: number; original: Verify; edited: Verify | null; spoofed: Verify | null }[] = []
const ms: number[] = []
for (const [i, raw] of all.entries()) {
  const call = async (text: string | null) => {
    if (text === null) return null
    const r = await post<Verify>("/api/verify", { raw: text })
    ms.push(r.ms)
    return r.status === 200 ? r.body : null
  }
  const original = await call(raw)
  if (!original) continue
  const row = { i, original, edited: null as Verify | null, spoofed: null as Verify | null }
  if (original.signer) {
    row.edited = await call(oneCharacter(raw))
    row.spoofed = await call(bankFrom(raw))
  }
  results.push(row)
}

const signed = results.filter((r) => r.original.signer)
const editedBroken = signed.filter((r) => r.edited && !r.edited.signer).length
const editedTotal = signed.filter((r) => r.edited).length
const spoofRejected = signed.filter((r) => r.spoofed && !r.spoofed.bankCredit && !r.spoofed.signer).length
const spoofTotal = signed.filter((r) => r.spoofed).length
const storedAsBank = results.filter((r) => r.original.bankCredit).length
const signerDomains = new Set(signed.map((r) => r.original.signer)).size

const summary = {
  source,
  messagesWithDkimHeader: all.length,
  checked: results.length,
  passingAligned: signed.length,
  signerDomains,
  oneCharacterEdit: { broken: editedBroken, of: editedTotal },
  fromRewrittenToBank: { rejected: spoofRejected, of: spoofTotal },
  storedAsBankCredit: storedAsBank,
  requestMs: { p50: percentile(ms, 50), p95: percentile(ms, 95) },
}

const file = await writeResult("signature", { ...info, summary, results: results.map((r) => ({ i: r.i, original: r.original.signatures, signer: r.original.signer, edited: r.edited?.signatures ?? null, spoofed: r.spoofed?.signatures ?? null })), finishedAt: new Date().toISOString() })
console.log(`## Real signed emails against /api/verify\n\nSource: ${source}\n`)
console.log(
  table(
    ["Metric", "Result"],
    [
      ["Messages with a DKIM-Signature header", all.length],
      ["Passing, aligned signature as archived", `${signed.length}/${results.length} (${signerDomains} signing domains)`],
      ["One body character changed → signature broken", `${editedBroken}/${editedTotal}`],
      ["From rewritten to hdfcbank.net → rejected", `${spoofRejected}/${spoofTotal}`],
      ["Stored as a bank credit", `${storedAsBank}/${results.length}`],
      ["Request time p50 / p95", `${fmtMs(summary.requestMs.p50)} / ${fmtMs(summary.requestMs.p95)}`],
    ],
  ),
)
console.log(`\nRaw: ${file}`)
