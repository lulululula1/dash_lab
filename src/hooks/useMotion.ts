import gsap from 'gsap'
import { useLayoutEffect, type RefObject } from 'react'
import { useSettings } from '../state/settings'

/** 현재 설정에 맞춘 애니메이션 시간 배율 (off면 0) */
export function useMotionScale(): number {
  const { motion } = useSettings()
  return motion === 'off' ? 0 : motion === 'reduced' ? 0.45 : 1
}

/**
 * 컨테이너 안의 [data-anim] 요소를 순차적으로 등장시킨다.
 * 애니메이션이 꺼져 있으면 즉시 최종 상태로 둔다.
 */
export function useStaggerIn(ref: RefObject<HTMLElement | null>, deps: unknown[] = [], selector = '[data-anim]') {
  const scale = useMotionScale()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const targets = el.querySelectorAll(selector)
    if (targets.length === 0) return
    if (scale === 0) {
      gsap.set(targets, { clearProps: 'all' })
      return
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 26 * scale, scale: 0.98, filter: 'blur(6px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.7 * scale,
          ease: 'power3.out',
          stagger: 0.06 * scale,
          clearProps: 'filter,transform',
        },
      )
    }, el)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, ...deps])
}
