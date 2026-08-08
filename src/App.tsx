import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapacitorApp } from '@capacitor/app'
import { useTheme } from './lib/theme'
import { useToast } from './lib/toast'
import { ensureSeed, db, type DataPackage, type PackageRow, type StudyMode } from './lib/db'
import { runBackInterceptors } from './lib/back'
import seedData from './seed-data.json'
import Library from './components/Library'
import Stats from './components/Stats'
import Me from './components/Me'
import DeckDetail from './components/DeckDetail'
import Study from './components/Study'
import Preview from './components/Preview'
import Mistakes from './components/Mistakes'
import ImportButton from './components/ImportButton'
import { IconChart, IconList, IconMoon, IconSun, IconUser, IconMistake } from './components/ui/icons'

type View = 'library' | 'mistakes' | 'stats' | 'me'

interface StudyCtx {
  packageId: number
  name: string
  mode: StudyMode
}

let seedToastShown = false

export default function App() {
  const { mode, toggle } = useTheme()
  const toast = useToast()
  const [view, setView] = useState<View>('library')
  const [detailPkg, setDetailPkg] = useState<PackageRow | null>(null)
  const [study, setStudy] = useState<StudyCtx | null>(null)
  const [previewPkg, setPreviewPkg] = useState<PackageRow | null>(null)
  const pkgCount = useLiveQuery(() => db.packages.count()) ?? 0

  useEffect(() => {
    void ensureSeed(seedData as unknown as DataPackage).then((ok) => {
      if (ok && !seedToastShown) {
        seedToastShown = true
        toast.info('已载入示例数据包')
      }
    })
  }, [toast])

  const beginStudy = (pkg: PackageRow, m: StudyMode) => {
    if (pkg.id == null) return
    setStudy({ packageId: pkg.id, name: pkg.name, mode: m })
    setDetailPkg(null)
    setPreviewPkg(null)
    setView('library')
  }

  const startStudy = (m: StudyMode) => {
    if (detailPkg) beginStudy(detailPkg, m)
  }

  const startPreview = (pkg: PackageRow) => {
    setPreviewPkg(pkg)
    setDetailPkg(null)
    setView('library')
  }

  const exitStudy = () => {
    setStudy(null)
    setView('library')
  }

  // 系统返回键：实现应用内逐级返回而非直接退出。
  // 用 ref 持有最新闭包，保证监听器始终读取到当前导航状态。
  const backRef = useRef<() => void>(() => {})
  backRef.current = () => {
    // 1) 嵌套弹窗优先消费（如删除二次确认框、学习退出确认）
    if (runBackInterceptors()) return
    // 2) 学习中 → 退出学习回到牌库
    if (study) {
      exitStudy()
      return
    }
    // 3) 预览页 → 返回牌库详情
    if (previewPkg) {
      setDetailPkg(previewPkg)
      setPreviewPkg(null)
      return
    }
    // 4) 牌库详情弹窗 → 关闭
    if (detailPkg) {
      setDetailPkg(null)
      return
    }
    // 5) 非首页 Tab → 回到首页 Tab
    if (view !== 'library') {
      setView('library')
      return
    }
    // 6) 首页根部 → 退出应用
    void CapacitorApp.exitApp()
  }

  useEffect(() => {
    let remove: (() => void) | undefined
    void CapacitorApp.addListener('backButton', () => {
      backRef.current()
    }).then((handle) => {
      remove = () => handle.remove()
    })
    return () => {
      remove?.()
    }
  }, [])

  return (
    <div className="app-shell">
      {previewPkg ? (
        <Preview
          pkg={previewPkg}
          onBack={() => {
            setDetailPkg(previewPkg)
            setPreviewPkg(null)
          }}
          onStartStudy={() => beginStudy(previewPkg, 'plan')}
        />
      ) : study ? (
        <Study
          packageId={study.packageId}
          mode={study.mode}
          deckName={study.name}
          onExit={exitStudy}
        />
      ) : (
        <>
          <header className="app-header">
            <div className="brand">
              <span className="logo">◆</span>
              翻牌背题
            </div>
            <div className="head-actions">
              <button
                className="btn btn-ghost btn-icon"
                onClick={toggle}
                aria-label="切换主题"
              >
                {mode === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </header>

          <main className="app-content">
            {view === 'library' && <Library onOpen={setDetailPkg} />}
            {view === 'mistakes' && <Mistakes onStartPractice={beginStudy} />}
            {view === 'stats' && <Stats />}
            {view === 'me' && <Me />}
          </main>

          <TabBar view={view} onChange={setView} />
        </>
      )}

      {/* 导入悬浮按钮：用 flex 定位层渲染到右下角（.fab-layer），
          规避旧 WebView 对 position 偏移 / right 的异常 */}
      {!study && !previewPkg && view === 'library' && pkgCount > 0 && (
        <div className="fab-layer">
          <ImportButton fab />
        </div>
      )}

      <DeckDetail
        pkg={detailPkg}
        onClose={() => setDetailPkg(null)}
        onStart={startStudy}
        onPreview={startPreview}
      />
    </div>
  )
}

function TabBar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const tabs: { key: View; label: string; icon: ReactNode }[] = [
    { key: 'library', label: '牌库', icon: <IconList /> },
    { key: 'mistakes', label: '错题', icon: <IconMistake /> },
    { key: 'stats', label: '统计', icon: <IconChart /> },
    { key: 'me', label: '我的', icon: <IconUser /> },
  ]
  return (
    <nav className="app-tabbar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab ${view === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
