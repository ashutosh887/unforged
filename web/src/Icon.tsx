export type IconName = "counter" | "scan" | "proof" | "shop" | "check" | "cross" | "clock" | "copy" | "image" | "lock" | "link" | "bolt" | "receipt" | "replay"

const paths: Record<IconName, string> = {
  counter: "M4 5h16v4H4zM4 11h16v8H4zM8 15h3",
  scan: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 12h8",
  proof: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4",
  shop: "M4 9l1.5-5h13L20 9M4 9v10h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M6 6l12 12M18 6L6 18",
  clock: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z",
  copy: "M9 9h10v10H9zM5 15V5h10",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  replay: "M4 12a8 8 0 108-8H8M8 4l-3 3 3 3",
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  )
}
