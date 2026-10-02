import { Resolver } from "node:dns/promises"
import { readFile } from "node:fs/promises"
import { fmtMs, intEnv, percentile, table, writeResult } from "./lib.js"

type Sample = { ms: number; ok: boolean; error?: string }

function tagFrom(header: string, tag: string): string | null {
  const match = header.match(new RegExp(`(?:^|;)\\s*${tag}=([^;\\s]+)`, "i"))
  return match?.[1]?.trim().toLowerCase() ?? null
}

async function signingTargets(): Promise<{ domain: string; selector: string }[]> {
  const domain = process.env.DKIM_DOMAIN?.trim().toLowerCase()
  const selector = process.env.DKIM_SELECTOR?.trim().toLowerCase()
  if (domain && selector) return [{ domain, selector }]
  const emlPath = process.env.ALERT_EML
  if (!emlPath) {
    console.error("Set DKIM_DOMAIN and DKIM_SELECTOR, or ALERT_EML to read them from the DKIM-Signature header")
    process.exit(1)
  }
  const raw = await readFile(emlPath, "utf8")
  const head = raw.split(/\r?\n\r?\n/)[0] ?? ""
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ")
  const targets = unfolded
    .split(/\r?\n/)
    .filter((line) => /^dkim-signature:/i.test(line))
    .flatMap((line) => {
      const d = tagFrom(line.slice(line.indexOf(":") + 1), "d")
      const s = tagFrom(line.slice(line.indexOf(":") + 1), "s")
      return d && s ? [{ domain: d, selector: s }] : []
    })
  if (targets.length === 0) {
    console.error(`No DKIM-Signature with d= and s= in ${emlPath}`)
    process.exit(1)
  }
  return targets
}

async function localSamples(name: string, n: number): Promise<Sample[]> {
  const samples: Sample[] = []
  for (let i = 0; i < n; i++) {
    const resolver = new Resolver()
    const started = performance.now()
    try {
      await resolver.resolveTxt(name)
      samples.push({ ms: performance.now() - started, ok: true })
    } catch (e) {
      samples.push({ ms: performance.now() - started, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return samples
}

const n = intEnv("N", 50)
const targets = await signingTargets()
const runs: { where: string; domain: string; selector: string; name: string; samples: Sample[] }[] = []

for (const { domain, selector } of targets) {
  const name = `${selector}._domainkey.${domain}`
  runs.push({ where: "local", domain, selector, name, samples: await localSamples(name, n) })
}

const rows = runs.map((r) => {
  const ok = r.samples.filter((s) => s.ok).map((s) => s.ms)
  return [r.where, r.name, `${ok.length}/${r.samples.length}`, fmtMs(percentile(ok, 50)), fmtMs(percentile(ok, 95)), fmtMs(ok.length ? Math.max(...ok) : null)]
})

const file = await writeResult("dkim-latency", {
  finishedAt: new Date().toISOString(),
  node: process.version,
  n,
  runs,
})
console.log("## DKIM DNS TXT lookup latency\n")
console.log(table(["Where", "Record", "OK", "p50", "p95", "max"], rows))
console.log(`\nRaw: ${file}`)
