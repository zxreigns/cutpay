/** Counter — a number that rolls to its new value. */
import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

export default function Counter({ value, prefix = '', suffix = '', decimals = 0, duration = 1.1, style }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number; style?: React.CSSProperties
}) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    const controls = animate(from, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) })
    return () => controls.stop()
  }, [value, duration])
  return (
    <span className="mono tnum" style={style}>
      {prefix}{shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  )
}
