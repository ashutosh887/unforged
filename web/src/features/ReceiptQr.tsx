import qrcode from "qrcode-generator"
import { useMemo } from "react"
import "./features.css"

export type ReceiptQrProps = {
  url: string
  size?: number
  label?: string
  showUrl?: boolean
}

export function absoluteUrl(url: string): string {
  if (typeof location === "undefined") return url
  try {
    return new URL(url, location.href).href
  } catch {
    return url
  }
}

export function qrPath(text: string): { path: string; modules: number } {
  const code = qrcode(0, "M")
  code.addData(text, "Byte")
  code.make()
  const modules = code.getModuleCount()
  let path = ""
  for (let row = 0; row < modules; row += 1) {
    let col = 0
    while (col < modules) {
      if (!code.isDark(row, col)) {
        col += 1
        continue
      }
      const start = col
      while (col < modules && code.isDark(row, col)) col += 1
      path += `M${start} ${row}h${col - start}v1h${start - col}z`
    }
  }
  return { path, modules }
}

export function ReceiptQr({ url, size = 176, label = "Scan to open this receipt", showUrl = true }: ReceiptQrProps) {
  const full = absoluteUrl(url)
  const { path, modules } = useMemo(() => qrPath(full), [full])
  const quiet = 2
  const box = modules + quiet * 2
  return (
    <figure className="qr" style={{ margin: 0 }}>
      <span className="qr-plate" style={{ width: size }}>
        <svg viewBox={`${-quiet} ${-quiet} ${box} ${box}`} role="img" aria-label={`QR code for ${full}`} shapeRendering="crispEdges">
          <rect x={-quiet} y={-quiet} width={box} height={box} fill="#ffffff" />
          <path d={path} fill="#1a1631" />
        </svg>
      </span>
      <figcaption className="qr-label">{label}</figcaption>
      {showUrl && <span className="qr-url hex">{full}</span>}
    </figure>
  )
}
