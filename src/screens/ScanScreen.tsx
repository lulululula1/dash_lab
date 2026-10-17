import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { GlassPanel, Icon } from '../components/ui'
import { assemble, assessQuality, buildColumns, extractTable } from '../engine/dataset'
import { makeDemoWorkbook } from '../engine/demoWorkbook'
import { toUserError, type DataError } from '../engine/errors'
import { readFile } from '../engine/parse'
import { recommendCharts } from '../engine/recommend'
import { useMotionScale } from '../hooks/useMotion'
import type { Dataset, RawWorkbook } from '../types/data'
import { formatBytes } from '../utils/format'

export type ScanJob = { kind: 'file'; file: File } | { kind: 'demo' } | { kind: 'sheet'; workbook: RawWorkbook; sheetIndex: number }

interface Props {
  job: ScanJob
  onDone: (workbook: RawWorkbook, sheetIndex: number, dataset: Dataset) => void
  onCancel: () => void
}

type PhaseId = 'read' | 'sheets' | 'header' | 'types' | 'quality' | 'charts'
const PHASES: { id: PhaseId; label: string }[] = [
  { id: 'read', label: '파일 읽기' },
  { id: 'sheets', label: '시트 구조 확인' },
  { id: 'header', label: '머리글·데이터 영역 탐지' },
  { id: 'types', label: '열 유형 검사 (숫자·문자·날짜)' },
  { id: 'quality', label: '결측치·중복값·오류 검사' },
  { id: 'charts', label: '통계 산출 · 차트 추천' },
]

/** 단계 사이에 화면을 갱신할 기회를 준다. 최소 표시 시간은 진행 상황을 읽을 수 있게 하기 위함이며 결과에는 영향이 없다. */
function pause(ms: number) {
  // requestAnimationFrame은 백그라운드 탭에서 멈추므로 타이머로만 양보한다 (탭 전환 중에도 분석 진행).
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(16, ms)))
}

export function ScanScreen({ job, onDone, onCancel }: Props) {
  const scale = useMotionScale()
  const [phase, setPhase] = useState(0)
  const [results, setResults] = useState<Partial<Record<PhaseId, string>>>({})
  const [error, setError] = useState<DataError | null>(null)
  const [pending, setPending] = useState<RawWorkbook | null>(null)
  const [ready, setReady] = useState(false)
  const [sheetChoice, setSheetChoice] = useState<number | null>(job.kind === 'sheet' ? job.sheetIndex : null)
  const bar = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const workbookRef = useRef<RawWorkbook | null>(job.kind === 'sheet' ? job.workbook : null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const title = job.kind === 'file' ? job.file.name : job.kind === 'demo' ? '[가상] 공공기관 교육 운영 실적' : job.workbook.fileName

  // 1~2단계: 파일 읽기와 시트 선택
  useEffect(() => {
    let cancelled = false
    const minMs = 420 * scale
    const run = async () => {
      try {
        setPhase(0)
        await pause(minMs)
        let wb = workbookRef.current
        if (!wb) {
          wb = job.kind === 'file' ? await readFile(job.file) : makeDemoWorkbook()
          workbookRef.current = wb
        }
        if (cancelled) return
        setResults((r) => ({
          ...r,
          read: wb.isDemo ? '가상 데이터 생성 완료' : `${wb.format.toUpperCase()} · ${formatBytes(wb.fileSize)}${wb.encoding ? ` · ${wb.encoding.toUpperCase()}` : ''}`,
        }))
        setPhase(1)
        await pause(minMs)
        if (cancelled) return
        setResults((r) => ({ ...r, sheets: `시트 ${wb.sheets.length}개` }))
        if (job.kind !== 'sheet') {
          if (wb.sheets.length > 1) setPending(wb)
          else setSheetChoice(0)
        }
        setReady(true)
      } catch (e) {
        if (!cancelled) setError(toUserError(e))
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  // 3~6단계: 선택한 시트 분석
  useEffect(() => {
    if (sheetChoice === null || !ready) return
    let cancelled = false
    const minMs = 420 * scale
    const run = async () => {
      try {
        const wb = workbookRef.current!
        const sheet = wb.sheets[sheetChoice]
        setPending(null)
        setPhase(2)
        await pause(minMs)
        if (cancelled) return
        const t = extractTable(sheet)
        setResults((r) => ({ ...r, header: `'${sheet.name}' · 머리글 ${t.headerRow}행 · 열 ${t.width}개 · 데이터 ${t.body.length.toLocaleString('ko-KR')}행` }))
        setPhase(3)
        await pause(minMs)
        if (cancelled) return
        const columns = buildColumns(t)
        const count = (type: string) => columns.filter((c) => c.type === type).length
        setResults((r) => ({ ...r, types: `숫자 ${count('number')} · 문자 ${count('string')} · 날짜 ${count('date')}${count('empty') ? ` · 빈 열 ${count('empty')}` : ''}` }))
        setPhase(4)
        await pause(minMs)
        if (cancelled) return
        const quality = assessQuality(t, columns)
        setResults((r) => ({
          ...r,
          quality: `결측 ${quality.totalMissing.toLocaleString('ko-KR')} · 해석 오류 ${quality.totalInvalid.toLocaleString('ko-KR')} · 중복 행 ${quality.duplicateRows.toLocaleString('ko-KR')}`,
        }))
        setPhase(5)
        await pause(minMs)
        if (cancelled) return
        const ds = assemble(wb, sheet, t, columns, quality)
        const charts = recommendCharts(ds)
        setResults((r) => ({ ...r, charts: `추천 차트 ${charts.length}개` }))
        setPhase(6)
        await pause(minMs * 1.4)
        if (!cancelled) doneRef.current(wb, sheetChoice, ds)
      } catch (e) {
        if (!cancelled) setError(toUserError(e))
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetChoice, ready])

  useEffect(() => {
    if (!bar.current) return
    gsap.to(bar.current, { width: `${(phase / PHASES.length) * 100}%`, duration: 0.5 * scale, ease: 'power2.out' })
  }, [phase, scale])

  useEffect(() => {
    if (!root.current || scale === 0) return
    const ctx = gsap.context(() => {
      gsap.from('.scan-in', { opacity: 0, y: 20, duration: 0.6 * scale, stagger: 0.08 * scale, ease: 'power3.out' })
    }, root)
    return () => ctx.revert()
  }, [scale])

  const percent = Math.round((phase / PHASES.length) * 100)

  return (
    <div ref={root} className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
      <GlassPanel corners reactive={false} className="scan-in w-full max-w-3xl p-6 sm:p-9">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="panel-title">STEP 02 · DATA SCAN</div>
            <h2 className="text-lg sm:text-xl font-bold mt-1 truncate" title={title}>
              {title}
            </h2>
          </div>
          <button className="btn btn-ghost text-sm shrink-0" onClick={onCancel}>
            취소
          </button>
        </div>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-7 items-center">
          <div className={`scan-in radar w-40 h-40 sm:w-44 sm:h-44 mx-auto ${pending || error ? 'paused' : ''}`}>
            <div className="absolute inset-0 grid place-items-center z-10">
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-gradient mono">{percent}%</div>
                <div className="text-[0.6rem] tracking-[0.3em] text-muted font-display mt-1">{error ? 'ERROR' : pending ? 'STANDBY' : phase >= PHASES.length ? 'COMPLETE' : 'SCANNING'}</div>
              </div>
            </div>
          </div>
          <ol className="space-y-2.5" aria-live="polite">
            {PHASES.map((p, i) => {
              const state = i < phase ? 'done' : i === phase && !error ? 'active' : 'wait'
              return (
                <li key={p.id} className="scan-in flex items-start gap-3">
                  <span
                    className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 border ${
                      state === 'done' ? 'bg-cyan/20 border-cyan text-cyan' : state === 'active' ? 'border-violet text-violet animate-pulse' : 'border-dim/50 text-dim'
                    }`}
                  >
                    {state === 'done' ? <Icon name="check" size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-sm ${state === 'wait' ? 'text-dim' : 'text-ink'}`}>{p.label}</div>
                    {results[p.id] && <div className="text-xs text-cyan-soft/80 mono mt-0.5 break-all">{results[p.id]}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="scan-in mt-7 progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="분석 진행률">
          <div ref={bar} className="progress-fill" style={{ width: 0 }} />
        </div>

        {pending && (
          <div className="mt-7">
            <div className="text-sm font-medium">분석할 시트를 선택하세요</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {pending.sheets.map((s, i) => (
                <button key={s.name + i} className="btn btn-ghost justify-between! text-left" onClick={() => setSheetChoice(i)}>
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon name="sheet" size={16} className="text-cyan shrink-0" />
                    <span className="truncate">{s.name}</span>
                    {s.hidden && <span className="badge badge-warn">숨김</span>}
                  </span>
                  <span className="text-xs text-muted mono shrink-0">{s.rows.length.toLocaleString('ko-KR')}행</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-7 rounded-xl border border-bad/40 bg-bad/5 p-4">
            <div className="flex items-center gap-2 text-bad font-medium">
              <Icon name="alert" size={16} />
              {error.message}
            </div>
            {error.hint && <p className="text-sm text-muted mt-1.5">{error.hint}</p>}
            <p className="text-xs text-dim mt-2">분석이 불가능한 경우 임의의 값을 만들지 않습니다.</p>
            <button className="btn btn-ghost mt-3 text-sm" onClick={onCancel}>
              다른 파일 선택
            </button>
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
