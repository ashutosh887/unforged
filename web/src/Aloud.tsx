import { useEffect, useRef, useState } from "react"
import "./features/features.css"

export type Spoken = { id: string; text: string; hi?: string }

export type Language = "en" | "hi"

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"

function hindiVoice(): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().replace("_", "-").startsWith("hi")) ?? null
}

function say(text: string, voice: SpeechSynthesisVoice | null = null) {
  if (!canSpeak()) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = voice ? "hi-IN" : "en-IN"
  if (voice) u.voice = voice
  u.rate = 0.95
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function spellOrder(ref: string): string {
  return ref.replace(/^order\s+/i, "").split("").join(" ")
}

function rupees(amountPaise: number): string {
  const whole = amountPaise % 100 === 0
  return `₹${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}

export function hindiLine(verdict: "VERIFIED" | "ALREADY_CLAIMED", amountPaise: number, orderRef?: string): string {
  const order = orderRef ? orderRef.replace(/^order\s+/i, "") : ""
  if (verdict === "VERIFIED") return `${rupees(amountPaise)} प्राप्त हुए${order ? `, ऑर्डर ${order}` : ""}`
  return `सावधान, ${rupees(amountPaise)} का यह भुगतान पहले ही इस्तेमाल हो चुका है${order ? `, ऑर्डर ${order} में` : ""}। सामान न दें।`
}

const key = "unforged.aloud"
const langKey = "unforged.aloud.lang"

function stored(): boolean {
  try {
    return localStorage.getItem(key) === "on"
  } catch {
    return false
  }
}

function storedLang(): Language {
  try {
    return localStorage.getItem(langKey) === "hi" ? "hi" : "en"
  } catch {
    return "en"
  }
}

function useHindiVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(hindiVoice)
  useEffect(() => {
    if (!canSpeak()) return
    const update = () => setVoice(hindiVoice())
    update()
    window.speechSynthesis.addEventListener("voiceschanged", update)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])
  return voice
}

export function Aloud({ items }: { items: Spoken[] }) {
  const [on, setOn] = useState(stored)
  const [lang, setLang] = useState<Language>(storedLang)
  const [last, setLast] = useState("")
  const said = useRef(new Set<string>())
  const supported = canSpeak()
  const voice = useHindiVoice()
  const speakHindi = lang === "hi" && voice !== null

  const speak = (item: Spoken) => {
    const text = speakHindi && item.hi ? item.hi : item.text
    setLast(text)
    say(text, speakHindi && item.hi ? voice : null)
  }

  useEffect(() => {
    if (!on) {
      items.forEach((i) => said.current.add(i.id))
      return
    }
    const next = items.find((i) => !said.current.has(i.id))
    if (!next) return
    items.forEach((i) => said.current.add(i.id))
    speak(next)
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
      speak(latest)
    }
  }

  const choose = (next: Language) => {
    setLang(next)
    try {
      localStorage.setItem(langKey, next)
    } catch {}
  }

  if (!supported) return null
  return (
    <div className="aloud">
      <button type="button" role="switch" aria-checked={on} className={`aloud-switch ${on ? "on" : ""}`} onClick={toggle}>
        <span className="aloud-knob" aria-hidden="true" />
        Announce aloud
      </button>
      <span className="segmented aloud-lang" role="group" aria-label="Announce in">
        <button type="button" aria-pressed={lang === "en"} onClick={() => choose("en")}>
          English
        </button>
        <button type="button" aria-pressed={lang === "hi"} onClick={() => choose("hi")} lang="hi">
          हिन्दी
        </button>
      </span>
      <p className="aloud-line" aria-live="polite">
        {on ? (last ? `Last read out, "${last}"` : "Each new verified payment is read out on this device.") : "Hear each verified payment, like a soundbox for a personal UPI ID."}
        {lang === "hi" && !voice ? " No Hindi voice on this device, so it reads in English." : ""}
      </p>
    </div>
  )
}
