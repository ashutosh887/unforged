import { useEffect, useState } from "react"

export function useMedia(query: string): boolean {
  const get = () => typeof matchMedia === "function" && matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== "function") return
    const list = matchMedia(query)
    const follow = () => setMatches(list.matches)
    list.addEventListener("change", follow)
    follow()
    return () => list.removeEventListener("change", follow)
  }, [query])
  return matches
}
