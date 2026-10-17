import { Suspense, lazy, useState } from 'react'
import { Background } from './components/ui'
import { ScanScreen, type ScanJob } from './screens/ScanScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SourceScreen } from './screens/SourceScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { SettingsProvider } from './state/settings'
import type { Dataset, RawWorkbook } from './types/data'

// 관제실(ECharts 포함)은 처음 필요할 때 불러와 첫 화면 로딩을 가볍게 한다.
const CommandCenter = lazy(() => import('./screens/CommandCenter').then((m) => ({ default: m.CommandCenter })))

type Screen = 'welcome' | 'source' | 'scan' | 'command' | 'settings'

interface Loaded {
  workbook: RawWorkbook
  sheetIndex: number
  dataset: Dataset
}

function Shell() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [settingsReturn, setSettingsReturn] = useState<Screen>('welcome')
  const [job, setJob] = useState<ScanJob | null>(null)
  const [scanSeq, setScanSeq] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  const startScan = (j: ScanJob) => {
    setJob(j)
    setScanSeq((s) => s + 1)
    setScreen('scan')
  }
  const openSettings = () => {
    setSettingsReturn(screen)
    setScreen('settings')
  }

  return (
    <>
      <Background />
      {screen === 'welcome' && <WelcomeScreen onStart={() => setScreen('source')} onSettings={openSettings} />}
      {screen === 'source' && (
        <SourceScreen
          onBack={() => setScreen(loaded ? 'command' : 'welcome')}
          onFile={(file) => startScan({ kind: 'file', file })}
          onDemo={() => startScan({ kind: 'demo' })}
        />
      )}
      {screen === 'scan' && job && (
        <ScanScreen
          key={scanSeq}
          job={job}
          onCancel={() => setScreen(loaded && job.kind === 'sheet' ? 'command' : 'source')}
          onDone={(workbook, sheetIndex, dataset) => {
            setLoaded({ workbook, sheetIndex, dataset })
            setJob(null)
            setScreen('command')
          }}
        />
      )}
      {screen === 'command' && loaded && (
        <Suspense fallback={<div className="relative z-10 min-h-screen grid place-items-center text-muted text-sm">관제실 모듈 불러오는 중…</div>}>
        <CommandCenter
          key={loaded.dataset.id}
          ds={loaded.dataset}
          workbook={loaded.workbook}
          sheetIndex={loaded.sheetIndex}
          onSwitchSheet={(i) => startScan({ kind: 'sheet', workbook: loaded.workbook, sheetIndex: i })}
          onNewData={() => setScreen('source')}
          onSettings={openSettings}
        />
        </Suspense>
      )}
      {screen === 'settings' && (
        <SettingsScreen
          hasData={loaded !== null}
          onBack={() => setScreen(settingsReturn === 'command' && !loaded ? 'welcome' : settingsReturn)}
          onClearData={() => {
            setLoaded(null)
            setJob(null)
            setSettingsReturn('welcome')
          }}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  )
}
