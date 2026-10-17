import { useRef, useState, type DragEvent } from 'react'
import { GlassPanel, Icon } from '../components/ui'
import { DEMO_NOTICE } from '../engine/demo'
import { DataError } from '../engine/errors'
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, validateFileMeta } from '../engine/parse'
import { useStaggerIn } from '../hooks/useMotion'

interface Props {
  onFile: (file: File) => void
  onDemo: () => void
  onBack: () => void
  error?: DataError | null
}

export function SourceScreen({ onFile, onDemo, onBack, error }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [localError, setLocalError] = useState<DataError | null>(null)
  useStaggerIn(root)

  const shown = localError ?? error

  const pick = (file: File | undefined) => {
    if (!file) return
    try {
      validateFileMeta(file.name, file.size)
      setLocalError(null)
      onFile(file)
    } catch (e) {
      setLocalError(e instanceof DataError ? e : new DataError('corrupted', '파일을 확인할 수 없습니다.'))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    if (e.dataTransfer.files.length > 1) {
      setLocalError(new DataError('unsupported-format', '한 번에 하나의 파일만 분석할 수 있습니다.'))
      return
    }
    pick(e.dataTransfer.files[0])
  }

  return (
    <div ref={root} className="relative z-10 min-h-screen flex flex-col px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header data-anim className="flex items-center gap-3">
        <button className="btn btn-ghost btn-icon" onClick={onBack} aria-label="뒤로">
          <Icon name="back" />
        </button>
        <div>
          <div className="panel-title">STEP 01 · SOURCE</div>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">데이터 소스 선택</h2>
        </div>
      </header>

      {shown && (
        <div data-anim role="alert" className="mt-6 glass border-bad/40! p-4 flex gap-3 items-start">
          <Icon name="alert" className="text-bad shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-bad">{shown.message}</div>
            {shown.hint && <div className="text-sm text-muted mt-1">{shown.hint}</div>}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1">
        <GlassPanel data-anim corners className="lg:col-span-3 p-5 sm:p-7 flex flex-col">
          <div className="panel-title">UPLOAD</div>
          <h3 className="text-lg font-semibold mt-1">내 파일 분석</h3>
          <div
            className={`dropzone ${drag ? 'active' : ''} mt-5 flex-1 min-h-[240px] rounded-2xl flex flex-col items-center justify-center text-center p-6 cursor-pointer focus-ring`}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="파일 선택 또는 끌어 놓기"
          >
            <div className={`w-16 h-16 rounded-2xl grid place-items-center bg-cyan/10 text-cyan transition-transform ${drag ? 'scale-110' : ''}`}>
              <Icon name="upload" size={30} />
            </div>
            <p className="mt-4 font-medium">파일을 끌어 놓거나 클릭해서 선택</p>
            <p className="mt-1 text-sm text-muted">
              {ACCEPTED_EXTENSIONS.join(', ').toUpperCase()} · 최대 {MAX_FILE_BYTES / 1024 / 1024}MB · 200,000행
            </p>
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <ul className="mt-5 space-y-1.5 text-xs text-muted">
            <li className="flex gap-2">
              <Icon name="shield" size={14} className="text-ok shrink-0 mt-0.5" />
              파일은 서버로 업로드되지 않으며 브라우저 메모리에서만 분석됩니다. 탭을 닫으면 사라집니다.
            </li>
            <li className="flex gap-2">
              <Icon name="info" size={14} className="text-cyan shrink-0 mt-0.5" />
              첫 행(또는 제목 행 아래 첫 행)을 열 이름으로 사용합니다. 여러 시트가 있으면 분석할 시트를 고를 수 있습니다.
            </li>
          </ul>
        </GlassPanel>

        <GlassPanel data-anim corners className="lg:col-span-2 p-5 sm:p-7 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="panel-title">DEMO</span>
            <span className="badge badge-violet">가상 데이터</span>
          </div>
          <h3 className="text-lg font-semibold mt-1">데모 모드</h3>
          <p className="mt-3 text-sm text-muted leading-relaxed">공공기관 교육 운영 실적을 가정한 가상 데이터로 관제실을 체험합니다.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {['연도 · 교육일자', '부서 · 교육과정', '교육인원 · 수료인원', '만족도 · 예산'].map((t) => (
              <div key={t} className="rounded-lg border border-cyan/15 bg-deep/60 px-3 py-2 text-muted">
                {t}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-warn/90 leading-relaxed">※ {DEMO_NOTICE} 품질 검사 시연을 위해 일부 결측치와 중복 행이 포함되어 있습니다.</p>
          <div className="flex-1" />
          <button className="btn btn-primary mt-6 w-full py-3" onClick={onDemo}>
            <Icon name="demo" />
            데모 데이터로 시작
          </button>
          <a className="mt-3 text-center text-xs text-cyan-soft hover:underline" href="/samples/demo-education.csv" download>
            샘플 CSV 내려받기
          </a>
        </GlassPanel>
      </div>
    </div>
  )
}
