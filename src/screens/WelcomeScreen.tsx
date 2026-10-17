import gsap from 'gsap'
import { useLayoutEffect, useRef } from 'react'
import { GlassPanel, Icon, Logo } from '../components/ui'
import { useMotionScale } from '../hooks/useMotion'

interface Props {
  onStart: () => void
  onSettings: () => void
}

const FEATURES = [
  { title: '브라우저 내 분석', body: '파일은 서버로 전송되지 않고 이 기기에서만 처리됩니다.', icon: 'shield' as const },
  { title: '자동 구조 분석', body: '숫자·문자·날짜 유형, 결측치, 중복값을 즉시 탐지합니다.', icon: 'spark' as const },
  { title: '자동 관제 대시보드', body: '데이터에 맞는 차트를 추천하고 필터로 연동합니다.', icon: 'demo' as const },
]

export function WelcomeScreen({ onStart, onSettings }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const scale = useMotionScale()

  useLayoutEffect(() => {
    if (!root.current || scale === 0) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.w-logo', { scale: 0.4, opacity: 0, rotate: -90, duration: 1 * scale })
        .from('.w-char', { opacity: 0, y: 40, rotateX: -90, stagger: 0.04 * scale, duration: 0.7 * scale }, '-=0.5')
        .from('.w-sub', { opacity: 0, letterSpacing: '1em', duration: 0.9 * scale }, '-=0.4')
        .from('.w-copy', { opacity: 0, y: 16, duration: 0.6 * scale }, '-=0.5')
        .from('.w-cta', { opacity: 0, y: 16, scale: 0.9, duration: 0.6 * scale, stagger: 0.08 }, '-=0.3')
        .from('.w-feature', { opacity: 0, y: 30, duration: 0.7 * scale, stagger: 0.1 * scale }, '-=0.3')
      gsap.to('.w-ring', { rotate: 360, duration: 40, repeat: -1, ease: 'none' })
    }, root)
    return () => ctx.revert()
  }, [scale])

  return (
    <div ref={root} className="relative z-10 min-h-screen flex flex-col">
      <header className="flex justify-end p-4 sm:p-6">
        <button className="btn btn-ghost btn-icon" onClick={onSettings} aria-label="설정">
          <Icon name="settings" />
        </button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16 text-center">
        <div className="relative mb-8">
          <div className="w-ring absolute inset-[-34px] rounded-full border border-dashed border-cyan/25" aria-hidden="true" />
          <div className="w-ring absolute inset-[-58px] rounded-full border border-violet/15" aria-hidden="true" style={{ borderStyle: 'dotted' }} />
          <div className="w-logo drop-shadow-[0_0_30px_rgba(34,211,238,0.5)]">
            <Logo size={96} />
          </div>
        </div>
        <h1 className="font-display font-black text-4xl sm:text-6xl md:text-7xl tracking-[0.12em]" style={{ perspective: 600 }} aria-label="NEXUS">
          {'NEXUS'.split('').map((c, i) => (
            <span key={i} className="w-char inline-block text-gradient" aria-hidden="true">
              {c}
            </span>
          ))}
        </h1>
        <p className="w-sub font-display text-xs sm:text-sm tracking-[0.6em] text-cyan-soft mt-3">DATA COMMAND</p>
        <p className="w-copy mt-6 max-w-xl text-muted text-sm sm:text-base leading-relaxed">
          엑셀·CSV 파일을 올리면 데이터 구조를 자동으로 분석하고,
          <br className="hidden sm:block" /> 데이터에 맞는 관제 대시보드를 즉시 구성합니다.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button className="w-cta btn btn-primary px-8 py-3 text-base" onClick={onStart}>
            관제 시스템 시작
            <Icon name="back" className="rotate-180" />
          </button>
        </div>
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl w-full text-left">
          {FEATURES.map((f) => (
            <GlassPanel key={f.title} className="w-feature p-5">
              <div className="flex items-center gap-2 text-cyan">
                <Icon name={f.icon} />
                <span className="font-medium text-ink">{f.title}</span>
              </div>
              <p className="mt-2 text-sm text-muted leading-relaxed">{f.body}</p>
            </GlassPanel>
          ))}
        </div>
      </main>
      <footer className="pb-6 text-center text-[0.7rem] text-dim font-mono">v0.1.0 · 브라우저 로컬 처리 · 외부 전송 없음</footer>
    </div>
  )
}
