export type SignatureTag = { tag: string; value: string }
export type BodyLine = { text: string; start: number }
export type SignedMail = {
  from: string
  subject: string
  date: string
  tags: SignatureTag[]
  domain: string
  selector: string
  bodyHash: string
  bodyCanon: "relaxed" | "simple"
  signedHeaders: string[]
  lines: BodyLine[]
}

function separator(raw: string): { at: number; length: number } {
  const m = raw.match(/\r?\n\r?\n/)
  return m && m.index !== undefined ? { at: m.index, length: m[0].length } : { at: -1, length: 0 }
}

export function bodyOf(raw: string): { body: string; start: number } {
  const { at, length } = separator(raw)
  return at < 0 ? { body: "", start: raw.length } : { body: raw.slice(at + length), start: at + length }
}

export function header(raw: string, name: string): string {
  const { at } = separator(raw)
  const head = at < 0 ? raw : raw.slice(0, at)
  const m = head.match(new RegExp(`^${name}:([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im"))
  return m ? m[1]!.replace(/\r?\n[ \t]+/g, " ").trim() : ""
}

export function signatureTags(value: string): SignatureTag[] {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes("="))
    .map((part) => {
      const eq = part.indexOf("=")
      return { tag: part.slice(0, eq).trim(), value: part.slice(eq + 1).replace(/\s+/g, " ").trim() }
    })
}

const address = /[\w.+-]+@[\w-]+(\.[\w-]+)+/

export function readMail(raw: string, lineCount = 5): SignedMail {
  const tags = signatureTags(header(raw, "DKIM-Signature"))
  const get = (t: string) => tags.find((x) => x.tag === t)?.value ?? ""
  const { body, start } = bodyOf(raw)
  const all: BodyLine[] = []
  let offset = start
  for (const piece of body.split("\n")) {
    const text = piece.replace(/\r$/, "")
    if (/[A-Za-z0-9]/.test(text) && !text.startsWith("--") && !/^[\w-]+:/.test(text) && !/^[>\s]*[\w-]+:/.test(text) && !address.test(text)) all.push({ text, start: offset })
    offset += piece.length + 1
  }
  const own = all.filter((l) => !l.text.startsWith(">"))
  const lines = (own.length >= 2 ? own : all).slice(0, lineCount)
  const canon = get("c").split("/")[1] ?? "simple"
  return {
    from: header(raw, "From"),
    subject: header(raw, "Subject"),
    date: header(raw, "Date"),
    tags,
    domain: get("d"),
    selector: get("s"),
    bodyHash: get("bh").replace(/\s+/g, ""),
    bodyCanon: canon === "relaxed" ? "relaxed" : "simple",
    signedHeaders: get("h").split(":").map((h) => h.trim()).filter(Boolean),
    lines,
  }
}

export function canonicalBody(body: string, mode: "relaxed" | "simple"): string {
  let lines = body.replace(/\r?\n/g, "\n").split("\n")
  if (mode === "relaxed") lines = lines.map((l) => l.replace(/[ \t]+/g, " ").replace(/ $/, ""))
  while (lines.length && lines[lines.length - 1] === "") lines.pop()
  if (!lines.length) return mode === "relaxed" ? "" : "\r\n"
  return lines.join("\r\n") + "\r\n"
}

export async function bodyHash(raw: string, mode: "relaxed" | "simple"): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalBody(bodyOf(raw).body, mode))
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  let binary = ""
  for (const b of digest) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function bump(ch: string): string {
  if (/[0-9]/.test(ch)) return String((Number(ch) + 1) % 10)
  if (ch === "z") return "a"
  if (ch === "Z") return "A"
  if (/[A-Za-z]/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) + 1)
  return ch === "." ? "," : "."
}

export function editAt(raw: string, at: number): { raw: string; was: string; now: string } {
  const was = raw[at] ?? ""
  const now = bump(was)
  return { raw: raw.slice(0, at) + now + raw.slice(at + 1), was, now }
}

export function firstEditable(mail: SignedMail): { line: number; col: number } | null {
  for (const [i, l] of mail.lines.entries()) {
    const digit = l.text.search(/[0-9]/)
    const col = digit >= 0 ? digit : l.text.search(/[A-Za-z]/)
    if (col >= 0) return { line: i, col }
  }
  return null
}
