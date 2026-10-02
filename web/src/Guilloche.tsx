function rosette(R: number, r: number, d: number, phase: number): string {
  const turns = r / gcd(R, r)
  const steps = 720 * turns
  const points: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns
    const x = (R - r) * Math.cos(t + phase) + d * Math.cos(((R - r) / r) * t + phase)
    const y = (R - r) * Math.sin(t + phase) - d * Math.sin(((R - r) / r) * t + phase)
    points.push(`${(200 + x).toFixed(1)},${(200 + y).toFixed(1)}`)
  }
  return `M${points.join("L")}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

const paths = [rosette(150, 34, 48, 0), rosette(150, 34, 48, 0.09), rosette(120, 46, 70, 0.04), rosette(96, 26, 40, 0.12)]

export function Guilloche() {
  return (
    <svg className="guilloche" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.6} />
      ))}
    </svg>
  )
}
