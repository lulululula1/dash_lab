import gsap from 'gsap'
import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import { useMotionScale } from '../hooks/useMotion'

export function Background() {
  return (
    <div className="nexus-bg" aria-hidden="true">
      <div className="nexus-grid" />
      <div className="nexus-scanline" />
    </div>
  )
}

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  corners?: boolean
  reactive?: boolean
}

/** 포인터 위치에 반응하는 테두리 광원을 가진 글래스 패널 */
export function GlassPanel({ children, className = '', corners = false, reactive = true, onPointerMove, ...rest }: GlassPanelProps) {
  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reactive) {
      const r = e.currentTarget.getBoundingClientRect()
      e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
      e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    onPointerMove?.(e)
  }
  return (
    <div className={`glass ${reactive ? 'reactive' : ''} ${className}`} onPointerMove={handleMove} {...rest}>
      {corners && (
        <>
          <span className="glass-corner left-2 top-2 border-l-2 border-t-2 rounded-tl" />
          <span className="glass-corner right-2 top-2 border-r-2 border-t-2 rounded-tr" />
          <span className="glass-corner bottom-2 left-2 border-b-2 border-l-2 rounded-bl" />
          <span className="glass-corner bottom-2 right-2 border-b-2 border-r-2 rounded-br" />
        </>
      )}
      {children}
    </div>
  )
}

interface CountUpProps {
  value: number | null
  format: (n: number) => string
  className?: string
  style?: CSSProperties
}

/** 값이 바뀔 때 이전 값에서 새 값으로 숫자를 굴린다. null이면 '—' */
export function CountUp({ value, format, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)
  const scale = useMotionScale()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value === null || !Number.isFinite(value)) {
      el.textContent = '—'
      return
    }
    if (scale === 0) {
      current.current = value
      el.textContent = format(value)
      return
    }
    const obj = { v: current.current }
    const tween = gsap.to(obj, {
      v: value,
      duration: 1.1 * scale,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = format(obj.v)
      },
      onComplete: () => {
        current.current = value
        el.textContent = format(value)
      },
    })
    return () => {
      current.current = obj.v
      tween.kill()
    }
  }, [value, format, scale])
  return <span ref={ref} className={className} style={style} />
}

const ICONS = {
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  demo: 'M4 19V9m5 10V5m5 14v-7m5 7V8',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  reset: 'M4 4v6h6M20 20v-6h-6M5.6 15a7 7 0 0 0 12.3 2M18.4 9A7 7 0 0 0 6.1 7',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M5 12l5 5L20 7',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M4 20h16',
  sheet: 'M4 4h16v16H4zM4 10h16M10 4v16',
  shield: 'M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  table: 'M3 5h18M3 12h18M3 19h18M8 5v14',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="nx-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d="M32 6 56 19.5v25L32 58 8 44.5v-25Z" fill="rgba(34,211,238,0.06)" stroke="url(#nx-logo)" strokeWidth="2.5" />
      <path d="M22 42V22l20 20V22" fill="none" stroke="url(#nx-logo)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={compact ? 30 : 38} />
      <div className="leading-none">
        <div className={`font-display font-bold tracking-[0.22em] text-gradient ${compact ? 'text-sm' : 'text-base'}`}>NEXUS</div>
        <div className="font-display text-[0.55rem] tracking-[0.38em] text-muted mt-1">DATA COMMAND</div>
      </div>
    </div>
  )
}
