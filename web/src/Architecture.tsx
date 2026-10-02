import { useMedia } from "./media"
import { PageHead, Section } from "./Site"

type Box = { x: number; y: number; w: number; h: number }
type NodeId = "browser" | "cdn" | "site" | "api" | "fn" | "dsql" | "kms" | "textract" | "bedrock" | "dns" | "uploads"
type Edge = [NodeId, NodeId, "across" | "down", boolean?]
type Layout = { width: number; height: number; boxes: Record<NodeId, Box>; edges: Edge[] }

const labels: Record<NodeId, [string, string]> = {
  browser: ["Browser", "React app"],
  cdn: ["CloudFront", "One HTTPS URL"],
  site: ["S3", "Static site, OAC"],
  api: ["API Gateway", "HTTP API, /api/*"],
  fn: ["Lambda", "Node 22, arm64"],
  dsql: ["Aurora DSQL", "Claims and ledger"],
  kms: ["AWS KMS", "Signs receipts"],
  textract: ["Amazon Textract", "Reads screenshots"],
  bedrock: ["Amazon Bedrock", "Second reader"],
  dns: ["DNS", "DKIM public keys"],
  uploads: ["S3 uploads", "Deleted after 24 h"],
}

const services: NodeId[] = ["dsql", "kms", "textract", "bedrock", "dns", "uploads"]

const wide: Layout = {
  width: 1000,
  height: 470,
  boxes: {
    browser: { x: 10, y: 203, w: 140, h: 64 },
    cdn: { x: 200, y: 203, w: 160, h: 64 },
    site: { x: 200, y: 50, w: 160, h: 64 },
    api: { x: 410, y: 203, w: 160, h: 64 },
    fn: { x: 620, y: 203, w: 150, h: 64 },
    ...Object.fromEntries(services.map((id, i) => [id, { x: 820, y: 14 + i * 76, w: 170, h: 58 }])),
  } as Record<NodeId, Box>,
  edges: [["browser", "cdn", "across"], ["cdn", "site", "down"], ["cdn", "api", "across"], ["api", "fn", "across"], ...services.map((id): Edge => ["fn", id, "across", id === "dsql"])],
}

const narrow: Layout = {
  width: 360,
  height: 600,
  boxes: {
    browser: { x: 10, y: 10, w: 160, h: 56 },
    cdn: { x: 10, y: 104, w: 160, h: 56 },
    site: { x: 190, y: 104, w: 160, h: 56 },
    api: { x: 10, y: 198, w: 160, h: 56 },
    fn: { x: 10, y: 292, w: 160, h: 56 },
    ...Object.fromEntries(services.map((id, i) => [id, { x: i % 2 ? 190 : 10, y: 392 + Math.floor(i / 2) * 70, w: 160, h: 56 }])),
  } as Record<NodeId, Box>,
  edges: [["browser", "cdn", "down"], ["cdn", "site", "across"], ["cdn", "api", "down"], ["api", "fn", "down"], ...services.map((id): Edge => ["fn", id, "down", id === "dsql"])],
}

function path(a: Box, b: Box, mode: "across" | "down"): string {
  if (mode === "across") {
    const ax = a.x + a.w
    const ay = a.y + a.h / 2
    const by = b.y + b.h / 2
    if (Math.abs(ay - by) < 1) return `M${ax} ${ay}H${b.x - 4}`
    const mid = ax + (b.x - ax) / 2
    return `M${ax} ${ay}H${mid}V${by}H${b.x - 4}`
  }
  const above = b.y < a.y
  const ax = a.x + a.w / 2
  const ay = above ? a.y : a.y + a.h
  const bx = b.x + b.w / 2
  const by = above ? b.y + b.h + 4 : b.y - 4
  if (Math.abs(ax - bx) < 1) return `M${ax} ${ay}V${by}`
  const mid = ay + (by - ay) / 2
  return `M${ax} ${ay}V${mid}H${bx}V${by}`
}

function Diagram({ layout }: { layout: Layout }) {
  return (
    <svg className="arch" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-labelledby="arch-title arch-desc">
      <title id="arch-title">Request path</title>
      <desc id="arch-desc">The browser calls CloudFront. CloudFront serves the site from S3 and sends /api/* to API Gateway, which invokes Lambda. Lambda uses Aurora DSQL, AWS KMS, Amazon Textract, Amazon Bedrock, DNS and an S3 upload bucket.</desc>
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="arch-head" />
        </marker>
        <marker id="arch-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="arch-head hot" />
        </marker>
      </defs>
      {layout.edges.map(([from, to, mode, hot]) => (
        <path key={`${from}-${to}`} className={`arch-edge${hot ? " hot" : ""}`} d={path(layout.boxes[from], layout.boxes[to], mode)} markerEnd={`url(#${hot ? "arch-arrow-hot" : "arch-arrow"})`} />
      ))}
      {(Object.keys(labels) as NodeId[]).map((id) => {
        const b = layout.boxes[id]
        const [name, sub] = labels[id]
        return (
          <g key={id} className={`arch-node${id === "dsql" ? " hot" : ""}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="10" />
            <text x={b.x + 14} y={b.y + b.h / 2 - 3} className="arch-name">
              {name}
            </text>
            <text x={b.x + 14} y={b.y + b.h / 2 + 16} className="arch-sub">
              {sub}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const pieces: [string, string][] = [
  ["CloudFront and S3", "One HTTPS URL for the site and the API. The bucket is private and only CloudFront can read it."],
  ["API Gateway and Lambda", "One small function per route, Node 22 on arm64. No servers to patch."],
  ["Aurora DSQL", "The claim insert and the receipt write run in one transaction. A unique key lets one claim through."],
  ["AWS KMS", "Signs each receipt with an ECDSA P-256 key that never leaves KMS."],
  ["Amazon Textract", "Reads the screenshot text. Code picks the UTR, amount and payee from it."],
  ["Amazon Bedrock", "Converse with a tool schema, wired as a second screenshot reader."],
  ["DNS", "Lambda fetches each sender's DKIM public key on every check."],
]

const rules: [string, string][] = [
  ["Unreadable", "The screenshot has no readable UTR or amount. Never guess."],
  ["Not found yet", "No signed credit with this UTR for the shop."],
  ["Amount mismatch", "A credit exists and the amount differs."],
  ["Payee mismatch", "The payee on the screenshot is not the shop's UPI ID."],
  ["Already claimed", "The claim insert hits the unique key."],
  ["Verified", "Everything else."],
]

const numbers: [string, string, string][] = [
  ["50 claims of one bank credit at once, 20 rounds", "20 of 20 rounds had one winner. Check-then-insert approved 1,000.", "§1"],
  ["The same credit claimed twice in a row, 10 rounds", "0 of 10 second claims approved", "§2"],
  ["One body letter changed in 37 real signed emails", "37 of 37 signatures broke", "§6"],
  ["From rewritten to hdfcbank.net on the same 37", "37 of 37 rejected", "§6"],
  ["Signature check round trip from India", "657 ms p50, 1,305 ms p95", "§6"],
  ["50 claims of one email over HTTP, 5 rounds", "One Verified in 5 of 5 rounds", "§7"],
  ["Textract on the two demo screenshots, 10 runs each", "60 of 60 fields right, 719 ms p50", "§8"],
  ["Receipts written into one ledger, 8 at a time", "32 of 32 signed, 0 chain breaks", "§9"],
]

const measurements = "https://github.com/ashutosh887/unforged/blob/main/docs/measurements.md"

export function Architecture() {
  const isWide = useMedia("(min-width: 760px)")
  return (
    <>
      <PageHead title="Architecture" sub="Serverless, one region, us-east-1. A model reads the screenshot. Code decides." />
      <figure className="arch-frame">
        <Diagram layout={isWide ? wide : narrow} />
      </figure>

      <Section title="Why each piece">
        <dl className="pieces">
          {pieces.map(([name, why]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{why}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Why DSQL and not DynamoDB">
        <p className="prose">
          DynamoDB TransactWriteItems with an attribute_not_exists condition gives the same claim-once result. I chose DSQL because the app reads its data as SQL joins, and the rule becomes
          one unique key that any Postgres reader can audit. The cost is optimistic concurrency, so the claim path retries conflicts up to 8 times.
        </p>
      </Section>

      <Section title="Verdict order" sub="Code checks these in order and returns the first that applies. No model decides.">
        <ol className="rules">
          {rules.map(([name, rule]) => (
            <li key={name}>
              <strong>{name}</strong>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Measured on the live stack" sub="Every number comes from a recorded run.">
        <div className="table-wrap">
          <table className="numbers">
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Result</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map(([run, result, ref]) => (
                <tr key={run}>
                  <th scope="row">{run}</th>
                  <td>{result}</td>
                  <td>
                    <a href={measurements} target="_blank" rel="noreferrer">
                      {ref}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}
