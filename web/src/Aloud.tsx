import { useEffect, useRef, useState } from "react"

export type Spoken = { id: string; text: string }

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"

function say(text: string) {
  if (!canSpeak()) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = "en-IN"
  u.rate = 0.95
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function spellOrder(ref: string): string {
  return ref.replace(/^order\s+/i, "").split("").join(" ")
}

const key = "unforged.aloud"

function stored(): boolean {
  try {
    return localStorage.getItem(key) === "on"
  } catch {
    return false
  }
}

export function Aloud({ items }: { items: Spoken[] }) {
  const [on, setOn] = useState(stored)
  const [last, setLast] = useState("")
  const said = useRef(new Set<string>())
  const supported = canSpeak()

  useEffect(() => {
    if (!on) {
      items.forEach((i) => said.current.add(i.id))
      return
    }
    const next = items.find((i) => !said.current.has(i.id))
    if (!next) return
    items.forEach((i) => said.current.add(i.id))
    setLast(next.text)
    say(next.text)
  }, [on, items])

  const toggle = () => {
    const turned = !on
    setOn(turned)
    try {
      localStorage.setItem(key, turned ? "on" : "off")
    } catch {}
    if (!turned) {
      if (canSpeak()) window.speechSynthesis.cancel()
      return
    }
    const latest = items[0]
    if (latest) {
      said.current.add(latest.id)
      setLast(latest.text)
      say(latest.text)
    }
  }

  if (!supported) return null
  return (
    <div className="aloud">
      <button type="button" role="switch" aria-checked={on} className={`aloud-switch ${on ? "on" : ""}`} onClick={toggle}>
        <span className="aloud-knob" aria-hidden="true" />
        Announce aloud
      </button>
      <p className="aloud-line" aria-live="polite">
        {on ? (last ? `Last read out, "${last}"` : "Each new verified payment is read out on this device.") : "Hear each verified payment, like a soundbox for a personal UPI ID."}
      </p>
    </div>
  )
}
