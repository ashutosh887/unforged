import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fmtMs, intEnv, meta, percentile, post, repoRoot, table, writeResult } from "./lib.js"

type Read = { read: { readable: boolean; utr: string | null; amountPaise: number | null; payeeVpa: string | null }; reader: string; boxes: { field: string }[]; ms: number }

const truth = { utr: "412345678901", payeeVpa: "demo.seller@okicici" }
const samples = [
  { file: "upi-paid.png", amountPaise: 50000 },
  { file: "upi-edited.png", amountPaise: 500000 },
]
const rounds = intEnv("ROUNDS", 10)
const info = meta()
const runs: { file: string; round: number; status: number; ms: number; serverMs: number | null; read: Read["read"] | null; boxes: number }[] = []
const rows: (string | number)[][] = []

for (const s of samples) {
  const image = (await readFile(join(repoRoot, "web/public/samples", s.file))).toString("base64")
  for (let round = 1; round <= rounds; round++) {
    const res = await post<Read>("/api/read", { image })
    runs.push({ file: s.file, round, status: res.status, ms: res.ms, serverMs: res.status === 200 ? res.body.ms : null, read: res.status === 200 ? res.body.read : null, boxes: res.status === 200 ? res.body.boxes.length : 0 })
  }
  const mine = runs.filter((r) => r.file === s.file)
  const ok = mine.filter((r) => r.read)
  const field = (pick: (r: (typeof ok)[number]) => boolean) => `${ok.filter(pick).length}/${mine.length}`
  rows.push([
    s.file,
    field((r) => r.read!.utr === truth.utr),
    field((r) => r.read!.amountPaise === s.amountPaise),
    field((r) => r.read!.payeeVpa === truth.payeeVpa),
    field((r) => r.boxes === 3),
    `${fmtMs(percentile(ok.map((r) => r.serverMs!), 50))} / ${fmtMs(percentile(ok.map((r) => r.serverMs!), 95))}`,
    `${fmtMs(percentile(mine.map((r) => r.ms), 50))} / ${fmtMs(percentile(mine.map((r) => r.ms), 95))}`,
  ])
}

const file = await writeResult("read-samples", { ...info, rounds, truth, samples, runs, finishedAt: new Date().toISOString() })
console.log("## Textract on the two sample screenshots\n")
console.log(table(["Image", "UTR right", "Amount right", "Payee right", "3 boxes drawn", "Textract p50 / p95", "Round trip p50 / p95"], rows))
console.log(`\nRaw: ${file}`)
