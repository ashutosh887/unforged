import { readFile } from "node:fs/promises"
import { intEnv, meta, post, requireEnv, table, writeResult } from "./lib.js"

type Decision = { verdict: string; reason: string }
type ReplayBody = {
  mode: "replay"
  utr: string
  guarded: { first: Decision; second: Decision }
  naive: { first: boolean; second: boolean }
}

type Arm = { first: boolean; second: boolean }

function isReplayBody(value: unknown): value is ReplayBody {
  return typeof value === "object" && value !== null && (value as { mode?: unknown }).mode === "replay"
}

const rounds = intEnv("ROUNDS", 10)
const info = meta()
const out: Record<string, unknown> = { ...info, rounds }
const rows: (string | number)[][] = []

const replays: { round: number; status: number; ms: number; body: unknown }[] = []
const guardedArms: Arm[] = []
const naiveArms: Arm[] = []
for (let round = 1; round <= rounds; round++) {
  const res = await post<unknown>("/api/race", { mode: "replay" })
  replays.push({ round, status: res.status, ms: res.ms, body: res.body })
  if (res.status !== 200 || !isReplayBody(res.body)) {
    console.error(`round ${round}: POST /api/race {"mode":"replay"} returned HTTP ${res.status}; the race handler needs replay mode`)
    continue
  }
  guardedArms.push({ first: res.body.guarded.first.verdict === "VERIFIED", second: res.body.guarded.second.verdict === "VERIFIED" })
  naiveArms.push({ first: res.body.naive.first, second: res.body.naive.second })
}
out.replays = replays

const tally = (arms: Arm[], key: keyof Arm) => `${arms.filter((a) => a[key]).length}/${arms.length}`
rows.push(["Unique index (race handler, replay mode)", tally(guardedArms, "first"), tally(guardedArms, "second")])
rows.push(["Naive table (race handler, replay mode)", tally(naiveArms, "first"), tally(naiveArms, "second")])
out.summary = {
  completedRounds: guardedArms.length,
  uniqueIndex: { approvedFirst: guardedArms.filter((a) => a.first).length, approvedSecond: guardedArms.filter((a) => a.second).length },
  naive: { approvedFirst: naiveArms.filter((a) => a.first).length, approvedSecond: naiveArms.filter((a) => a.second).length },
}

const emlPath = process.env.ALERT_EML
const shotPath = process.env.SCREENSHOT
if (emlPath && shotPath) {
  const vpas = requireEnv("SHOP_VPAS").split(",").map((v) => v.trim()).filter(Boolean)
  const shop = await post<{ shopId?: string; token?: string }>("/api/shops", { name: `replay-${Date.now()}`, vpas })
  const token = shop.body.token
  if (shop.status !== 201 || !token) {
    out.endToEnd = { error: "shop creation failed", shop }
  } else {
    const headers = { "x-shop-token": token }
    const alert = await post<unknown>("/api/alerts", { raw: await readFile(emlPath, "utf8") }, headers)
    const image = (await readFile(shotPath)).toString("base64")
    const format = shotPath.split(".").pop()!.toLowerCase()
    const first = await post<Decision>("/api/check", { image, format, orderRef: "replay-first" }, headers)
    const second = await post<Decision>("/api/check", { image, format, orderRef: "replay-second" }, headers)
    out.endToEnd = {
      shopId: shop.body.shopId,
      alert: { status: alert.status, ms: alert.ms, body: alert.body },
      first: { status: first.status, ms: first.ms, body: first.body },
      second: { status: second.status, ms: second.ms, body: second.body },
    }
    rows.push(["Unique index (signed alert + /api/check, once)", `${first.body.verdict === "VERIFIED" ? 1 : 0}/1 (${first.body.verdict})`, `${second.body.verdict === "VERIFIED" ? 1 : 0}/1 (${second.body.verdict})`])
  }
}

const file = await writeResult("replay", { ...out, finishedAt: new Date().toISOString() })
console.log("## Replay ablation: the same credit claimed twice\n")
console.log(table(["Path", "Approved first claims", "Approved second claims"], rows))
console.log(`\nRaw: ${file}`)
