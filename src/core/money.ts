export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "")
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? "0").padEnd(2, "0"))
  return whole * 100 + fraction
}

export function formatPaise(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const fraction = paise % 100
  const grouped = rupees.toLocaleString("en-IN")
  return fraction === 0 ? `₹${grouped}` : `₹${grouped}.${String(fraction).padStart(2, "0")}`
}

export function istTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return `${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST`
}
