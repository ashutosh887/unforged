import { useMemo } from "react"
import claimSource from "../../../src/core/claim.ts?raw"
import verdictSource from "../../../src/core/verdict.ts?raw"
import "./features.css"

export type Token = { kind: "kw" | "str" | "num" | "const" | "com" | "fn" | "plain"; text: string }

const keywords = new Set([
  "async", "await", "break", "case", "catch", "const", "continue", "default", "else", "export", "false", "for", "from", "function", "if", "import", "in", "let", "new", "null", "of", "return", "switch", "throw", "true", "try", "type", "typeof", "undefined", "while",
])

export const rules = [
  { n: 1, verdict: "UNREADABLE", says: "No readable UTR or amount on the screenshot. Nothing is guessed." },
  { n: 2, verdict: "NOT_FOUND_YET", says: "No signed bank alert with this UTR has reached the shop." },
  { n: 3, verdict: "AMOUNT_MISMATCH", says: "The bank credited a different amount for this UTR." },
  { n: 4, verdict: "PAYEE_MISMATCH", says: "The screenshot names a UPI ID that is not the shop's." },
  { n: 5, verdict: "ALREADY_CLAIMED", says: "The claim insert hit the unique index. This credit paid for another order." },
  { n: 6, verdict: "VERIFIED", says: "Everything matched and this claim was the first one." },
] as const

function endOfQuoted(src: string, start: number): number {
  const quote = src[start]
  let i = start + 1
  while (i < src.length && src[i] !== quote && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1
  return Math.min(i + 1, src.length)
}

function endOfTemplate(src: string, start: number): number {
  let i = start + 1
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") {
      i += 2
      continue
    }
    if (src[i] === "$" && src[i + 1] === "{") {
      i = endOfInterpolation(src, i + 2)
      continue
    }
    i += 1
  }
  return Math.min(i + 1, src.length)
}

function endOfInterpolation(src: string, start: number): number {
  let depth = 1
  let i = start
  while (i < src.length && depth > 0) {
    const c = src[i]!
    if (c === "`") i = endOfTemplate(src, i)
    else if (c === '"' || c === "'") i = endOfQuoted(src, i)
    else {
      if (c === "{") depth += 1
      if (c === "}") depth -= 1
      i += 1
    }
  }
  return i
}

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let plain = ""
  const flush = () => {
    if (plain) out.push({ kind: "plain", text: plain })
    plain = ""
  }
  const push = (kind: Token["kind"], text: string) => {
    flush()
    out.push({ kind, text })
  }
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i)
      const stop = end === -1 ? src.length : end
      push("com", src.slice(i, stop))
      i = stop
    } else if (c === '"' || c === "'") {
      const end = endOfQuoted(src, i)
      push("str", src.slice(i, end))
      i = end
    } else if (c === "`") {
      const end = endOfTemplate(src, i)
      push("str", src.slice(i, end))
      i = end
    } else if (/[0-9]/.test(c) && !/[A-Za-z_$0-9]/.test(src[i - 1] ?? "")) {
      const m = /^[0-9][0-9_.]*/.exec(src.slice(i))![0]
      push("num", m)
      i += m.length
    } else if (/[A-Za-z_$]/.test(c)) {
      const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))![0]
      if (keywords.has(word)) push("kw", word)
      else if (/^[A-Z][A-Z0-9_]{2,}$/.test(word)) push("const", word)
      else if (src[i + word.length] === "(") push("fn", word)
      else plain += word
      i += word.length
    } else {
      plain += c
      i += 1
    }
  }
  flush()
  return out
}

export function splitLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]]
  for (const t of tokens) {
    const parts = t.text.split("\n")
    parts.forEach((part, k) => {
      if (k > 0) lines.push([])
      if (part) lines[lines.length - 1]!.push({ kind: t.kind, text: part })
    })
  }
  return lines
}

export function excerpt(src: string, from: string, to?: string): { text: string; firstLine: number } {
  const start = src.indexOf(from)
  if (start === -1) return { text: src.trimEnd(), firstLine: 1 }
  const end = to ? src.indexOf(to, start + from.length) : -1
  const text = src.slice(start, end === -1 ? undefined : end).trimEnd()
  return { text, firstLine: src.slice(0, start).split("\n").length }
}

export function ruleMarks(sources: string[]): Map<number, number>[] {
  const taken = new Set<number>()
  return sources.map((text) => {
    const marks = new Map<number, number>()
    text.split("\n").forEach((line, k) => {
      const hit = rules.find((r) => !taken.has(r.n) && line.includes(`verdict: "${r.verdict}"`))
      if (!hit) return
      taken.add(hit.n)
      marks.set(k, hit.n)
    })
    return marks
  })
}

function Source({ file, text, firstLine, marks }: { file: string; text: string; firstLine: number; marks: Map<number, number> }) {
  const lines = useMemo(() => splitLines(tokenize(text)), [text])
  return (
    <pre className="vcode-source" tabIndex={0} aria-label={`Source of ${file}`}>
      <div className="vcode-file">{file}</div>
      <code className="vcode-lines">
        {lines.map((line, k) => {
          const rule = marks.get(k)
          return (
            <span key={k} className={`vcode-line ${rule ? "ruled" : ""}`}>
              <span className="vcode-no">{firstLine + k}</span>
              <span>{rule ? <span className="vcode-badge" aria-label={`Rule ${rule}`}>{rule}</span> : null}</span>
              <span>
                {line.length === 0 ? " " : line.map((t, j) => (t.kind === "plain" ? <span key={j}>{t.text}</span> : <span key={j} className={`tok-${t.kind}`}>{t.text}</span>))}
              </span>
            </span>
          )
        })}
      </code>
    </pre>
  )
}

export type VerdictCodeProps = { title?: string; showClaim?: boolean }

export function VerdictCode({ title = "The model reads. Code decides.", showClaim = true }: VerdictCodeProps) {
  const before = excerpt(verdictSource, "export function decideBeforeClaim")
  const claim = excerpt(claimSource, "export async function claim(")
  const [beforeMarks, claimMarks] = useMemo(() => ruleMarks([before.text, claim.text]), [before.text, claim.text])
  return (
    <section className="feature-card" aria-labelledby="vcode-title">
      <header className="feature-head">
        <h2 id="vcode-title">{title}</h2>
        <span className="feature-kicker">The real source, built into this page</span>
      </header>
      <div className="vcode">
        <div style={{ display: "grid", gap: "0.75rem", minWidth: 0 }}>
          <Source file="src/core/verdict.ts" text={before.text} firstLine={before.firstLine} marks={beforeMarks!} />
          {showClaim && <Source file="src/core/claim.ts" text={claim.text} firstLine={claim.firstLine} marks={claimMarks!} />}
        </div>
        <div style={{ display: "grid", gap: "0.9rem" }}>
          <ol className="vcode-rules">
            {rules.map((r) => (
              <li key={r.n} className="vcode-rule">
                <span className="vcode-badge" aria-hidden="true">{r.n}</span>
                <span>
                  <strong>{r.verdict}</strong>
                  <span>{r.says}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="vcode-model">
            The reader only returns the <code>utr</code>, <code>amount</code> and <code>payeeVpa</code> it sees. It never picks the verdict.
          </p>
        </div>
      </div>
    </section>
  )
}
