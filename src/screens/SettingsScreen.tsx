import { useRef, useState } from 'react'
import { GlassPanel, Icon } from '../components/ui'
import { MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS } from '../engine/parse'
import { useStaggerIn } from '../hooks/useMotion'
import { useSettings } from '../state/settings'
import { DEFAULT_SETTINGS, clearSavedSettings, saveSettings, type MotionLevel, type Settings } from '../state/settingsStorage'
import { formatNumber } from '../utils/format'

interface Props {
  onBack: () => void
  hasData: boolean
  onClearData: () => void
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-deep/70 p-1 border border-cyan/10" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          className={`px-3 py-1.5 rounded-lg text-sm transition-all focus-ring ${value === o.value ? 'bg-cyan text-void font-semibold shadow-[0_0_14px_rgba(34,211,238,0.45)]' : 'text-muted hover:text-ink'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsScreen({ onBack, hasData, onClearData }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const { settings, setSettings } = useSettings()
  const [saved, setSaved] = useState<'idle' | 'ok' | 'fail'>('idle')
  useStaggerIn(root)

  const patch = (p: Partial<Settings>) => {
    setSettings({ ...settings, ...p })
    setSaved('idle')
  }

  return (
    <div ref={root} className="relative z-10 min-h-screen px-4 sm:px-8 py-6 max-w-3xl mx-auto">
      <header data-anim className="flex items-center gap-3">
        <button className="btn btn-ghost btn-icon" onClick={onBack} aria-label="뒤로">
          <Icon name="back" />
        </button>
        <div>
          <div className="panel-title">SYSTEM CONFIG</div>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">설정</h2>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        <GlassPanel data-anim className="p-5 space-y-5">
          <div>
            <div className="font-medium">애니메이션</div>
            <p className="text-xs text-muted mt-1 mb-3">OS의 '동작 줄이기' 설정이 켜져 있으면 '전체'도 자동으로 줄여서 표시합니다.</p>
            <Segmented<MotionLevel>
              label="애니메이션 수준"
              value={settings.motion}
              onChange={(motion) => patch({ motion })}
              options={[
                { value: 'full', label: '전체' },
                { value: 'reduced', label: '줄이기' },
                { value: 'off', label: '끄기' },
              ]}
            />
          </div>
          <div>
            <div className="font-medium">소수점 자릿수</div>
            <p className="text-xs text-muted mt-1 mb-3">미리보기: {formatNumber(12345.6789, { decimals: settings.decimals })}</p>
            <Segmented label="소수점 자릿수" value={settings.decimals} onChange={(decimals) => patch({ decimals })} options={[0, 1, 2, 3].map((v) => ({ value: v, label: `${v}자리` }))} />
          </div>
          <div>
            <div className="font-medium">큰 수 축약 (만·억·조)</div>
            <p className="text-xs text-muted mt-1 mb-3">미리보기: {formatNumber(123456789, { decimals: settings.decimals, compact: settings.compactNumbers })}</p>
            <Segmented
              label="큰 수 축약"
              value={settings.compactNumbers ? 'on' : 'off'}
              onChange={(v) => patch({ compactNumbers: v === 'on' })}
              options={[
                { value: 'on', label: '축약' },
                { value: 'off', label: '전체 표기' },
              ]}
            />
          </div>
          <div>
            <div className="font-medium">차트 최대 범주 수</div>
            <p className="text-xs text-muted mt-1 mb-3">초과하는 범주는 합계·건수일 때 '기타'로 합산하고, 그 외 집계에서는 생략 사실을 표시합니다.</p>
            <Segmented label="차트 최대 범주 수" value={settings.maxCategories} onChange={(maxCategories) => patch({ maxCategories })} options={[8, 12, 20, 30].map((v) => ({ value: v, label: `${v}개` }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-cyan/10">
            <button
              className="btn btn-primary"
              onClick={() => setSaved(saveSettings(settings) ? 'ok' : 'fail')}
            >
              이 브라우저에 설정 저장
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                clearSavedSettings()
                setSettings(DEFAULT_SETTINGS)
                setSaved('idle')
              }}
            >
              기본값 복원
            </button>
            <span className="text-xs" role="status">
              {saved === 'ok' && <span className="text-ok">저장했습니다.</span>}
              {saved === 'fail' && <span className="text-bad">이 브라우저에서는 저장소를 사용할 수 없습니다. 이번 세션에만 적용됩니다.</span>}
              {saved === 'idle' && <span className="text-dim">변경 사항은 즉시 적용되며, 저장 버튼을 눌러야 다음 방문에도 유지됩니다.</span>}
            </span>
          </div>
        </GlassPanel>

        <GlassPanel data-anim className="p-5">
          <div className="flex items-center gap-2 font-medium">
            <Icon name="shield" size={17} className="text-ok" />
            데이터 보안 정책
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
            <li>업로드한 파일은 브라우저 메모리에서만 분석하며 외부 서버로 전송하지 않습니다.</li>
            <li>업로드 데이터는 브라우저 저장소(localStorage 등)에 기록하지 않습니다. 저장되는 것은 위 화면 설정뿐입니다.</li>
            <li>
              파일 제한: CSV·XLSX, 최대 {MAX_FILE_BYTES / 1024 / 1024}MB, {MAX_ROWS.toLocaleString('ko-KR')}행, {MAX_COLUMNS}열.
            </li>
            <li>오류 메시지에는 셀 내용 등 데이터 값을 포함하지 않습니다.</li>
            <li>API 키는 프런트엔드에 포함되어 있지 않습니다 (현재 AI 기능 없음).</li>
          </ul>
          {hasData && (
            <button className="btn btn-ghost mt-4 text-bad! border-bad/30!" onClick={onClearData}>
              현재 분석 데이터를 메모리에서 지우기
            </button>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}
