import { useEffect, useRef, useState } from 'react'
import { db, recordAnswer, flipCardStatus, shuffle, getProgress, saveProgress, clearProgress, type CardRow, type StudyMode } from '../lib/db'
import { useTheme } from '../lib/theme'
import { registerBackHandler } from '../lib/back'
import Button from './ui/Button'
import ProgressRing from './ui/ProgressRing'
import FlashCard from './FlashCard'
import Modal from './ui/Modal'
import {
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconMoon,
  IconRepeat,
  IconSun,
  IconX,
} from './ui/icons'

interface Props {
  packageId: number
  mode: StudyMode
  deckName: string
  onExit: () => void
}

interface Summary {
  reviewed: number
  known: number
  unknown: number
}

export default function Study({ packageId, mode, deckName, onExit }: Props) {
  const { mode: themeMode, toggle } = useTheme()

  const [localMode] = useState<StudyMode>(mode)
  const [runId, setRunId] = useState(0)

  const [cardsMap, setCardsMap] = useState<Record<number, CardRow>>({})
  const [queue, setQueue] = useState<number[]>([])
  const [pending, setPending] = useState<number[]>([])
  const [answered, setAnswered] = useState(0)
  const [current, setCurrent] = useState<CardRow | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [choice, setChoice] = useState<'known' | 'unknown' | null>(null)
  const [finished, setFinished] = useState(false)
  const [summary, setSummary] = useState<Summary>({ reviewed: 0, known: 0, unknown: 0 })
  const [totalMain, setTotalMain] = useState(0)
  // 退出确认：未完成练习时返回需先警告，避免误触丢失进度
  const [warn, setWarn] = useState(false)
  const warnRef = useRef(false)
  useEffect(() => {
    warnRef.current = warn
  }, [warn])

  // 断点续练：首次进入尝试恢复上次进度；ready 后才持久化，避免覆盖已存进度
  const isFirstRef = useRef(true)
  const readyRef = useRef(false)
  const [resumeInfo, setResumeInfo] = useState<{ answered: number; remaining: number } | null>(null)

  // 初始化 / 重置学习队列（数据包、模式或重开变化时）
  // 首次进入时尝试断点续练：恢复到上次退出时的题目位置
  useEffect(() => {
    let alive = true
    const attemptResume = isFirstRef.current
    isFirstRef.current = false
    void (async () => {
      const cards = await db.cards.where('packageId').equals(packageId).toArray()
      if (!alive) return
      const map: Record<number, CardRow> = {}
      for (const c of cards) if (c.id != null) map[c.id] = c

      let initQueue: number[] = []
      let initPending: number[] = []
      let initAnswered = 0
      let resumed = false

      // 尝试从已保存进度恢复（仅首次进入、且模式一致时）
      if (attemptResume) {
        const prog = await getProgress(packageId)
        if (prog && prog.mode === localMode && (prog.queue?.length || prog.pending?.length)) {
          let rq = (prog.queue ?? []).filter((id) => map[id] != null)
          const rp = (prog.pending ?? []).filter((id) => map[id] != null)
          // 随机 / 错题本模式：恢复时剔除中途已掌握的题
          if (localMode !== 'sequential') {
            rq = rq.filter((id) => map[id].status !== 'known')
          }
          if (rq.length || rp.length) {
            initQueue = rq
            initPending = rp
            initAnswered = prog.answered ?? 0
            resumed = true
          }
        }
      }

      // 未恢复则按模式重新构建队列
      if (!resumed) {
        if (localMode === 'mistake') {
          initQueue = cards.filter((c) => c.status === 'mistake').map((c) => c.id!)
        } else if (localMode === 'random') {
          // 随机模式排除已掌握的题
          initQueue = shuffle(cards.filter((c) => c.status !== 'known').map((c) => c.id!))
        } else {
          initQueue = cards.slice().sort((a, b) => a.order - b.order).map((c) => c.id!)
        }
      }

      setCardsMap(map)
      setTotalMain(initAnswered + initQueue.length + initPending.length)
      setQueue(initQueue)
      setPending(initPending)
      setAnswered(initAnswered)
      setSummary({ reviewed: 0, known: 0, unknown: 0 })
      setFlipped(false)
      setChoice(null)
      setResumeInfo(resumed ? { answered: initAnswered, remaining: initQueue.length + initPending.length } : null)
      if (initQueue.length === 0 && initPending.length === 0) {
        setCurrent(null)
        setFinished(true)
      } else {
        setCurrent(map[initQueue[0]])
        setFinished(false)
      }
      readyRef.current = true
    })()
    return () => {
      alive = false
    }
  }, [packageId, localMode, runId])

  // 进度持久化：队列 / 待重练 / 已答数变化时保存，便于断点续练；
  // 一轮完成（finished）则清除进度，下次从头开始。
  useEffect(() => {
    if (!readyRef.current) return
    if (finished) {
      void clearProgress(packageId)
      return
    }
    void saveProgress(packageId, localMode, queue, pending, answered)
  }, [queue, pending, answered, finished, localMode, packageId])

  const answer = (known: boolean) => {
    if (!current || flipped) return
    setFlipped(true)
    setChoice(known ? 'known' : 'unknown')
    void recordAnswer(current.id!, known, localMode)
    setSummary((s) => ({
      reviewed: s.reviewed + 1,
      known: s.known + (known ? 1 : 0),
      unknown: s.unknown + (known ? 0 : 1),
    }))
    // 「不清楚」→ 随机插入待重练队列，稍后在后面再次出现
    if (!known) {
      setPending((p) => {
        const next = p.slice()
        const idx = Math.floor(Math.random() * (next.length + 1))
        next.splice(idx, 0, current.id!)
        return next
      })
    }
  }

  // 翻面后改判：把本题直接判为 知道/不知道（修正练习中的选择，不重复计数）
  const choose = (know: boolean) => {
    if (!current || !choice || !flipped) return
    const target = know ? 'known' : 'unknown'
    if (choice === target) return
    const wasKnown = choice === 'known'
    setChoice(target)
    void flipCardStatus(current.id!, know)
    setSummary((s) => ({
      reviewed: s.reviewed,
      known: s.known + (know ? 1 : 0) - (wasKnown ? 1 : 0),
      unknown: s.unknown + (know ? 0 : 1) - (!wasKnown ? 1 : 0),
    }))
    // 同步待重练队列：判为「知道」则移出，判为「不清楚」则随机插入
    setPending((p) => {
      const exists = p.includes(current.id!)
      if (know) {
        return exists ? p.filter((id) => id !== current.id!) : p
      }
      if (exists) return p
      const next = p.slice()
      const idx = Math.floor(Math.random() * (next.length + 1))
      next.splice(idx, 0, current.id!)
      return next
    })
  }

  const next = () => {
    let nextId: number | null = null
    let nq = queue
    let np = pending
    if (queue.length > 0) {
      nextId = queue[0]
      nq = queue.slice(1)
    } else if (pending.length > 0) {
      const idx = Math.floor(Math.random() * pending.length)
      nextId = pending[idx]
      np = pending.slice(0, idx).concat(pending.slice(idx + 1))
    }
    setQueue(nq)
    setPending(np)
    setAnswered((a) => a + 1)
    if (nextId == null) {
      setCurrent(null)
      setFinished(true)
    } else {
      setCurrent(cardsMap[nextId] ?? null)
      setFlipped(false)
      setChoice(null)
    }
  }

  const remaining = queue.length + pending.length
  const denom = answered + remaining
  const prog = denom === 0 ? 1 : answered / denom
  const accuracy = summary.reviewed ? Math.round((summary.known / summary.reviewed) * 100) : 0

  // 系统返回键：未完成时弹确认框拦截，已完成则放行给上层退出
  useEffect(() => {
    return registerBackHandler(() => {
      if (warnRef.current) {
        setWarn(false)
        return true
      }
      if (finished) return false
      setWarn(true)
      return true
    })
  }, [finished])

  // 顶部返回箭头：未完成先弹确认，已完成直接退出
  const handleRequestExit = () => {
    if (finished) onExit()
    else setWarn(true)
  }

  // 放弃续练进度，从第一题重新开始
  const restart = () => {
    setResumeInfo(null)
    void clearProgress(packageId)
    setRunId((r) => r + 1)
  }

  return (
    <div className="study-screen">
      <header className="app-header study-header">
        <button className="btn btn-ghost btn-icon" onClick={handleRequestExit} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="study-title">{deckName}</div>
        <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label="切换主题">
          {themeMode === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </header>

      <div className="app-content study-content">
        <div className="study-top">
          <div className="study-progress-info">
            <div className="study-progress-meta">
              <span className="study-progress-done">
                已做 <b>{answered}</b> / {denom}
              </span>
              <span className="study-progress-rest">剩余 {remaining}</span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={Math.round(prog * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="练习进度"
            >
              <span style={{ width: `${Math.max(0, Math.min(100, Math.round(prog * 100)))}%` }} />
            </div>
          </div>
          <ProgressRing progress={prog} size={56} stroke={7}>
            <span className="ring-pct" style={{ fontSize: 15 }}>
              {Math.round(prog * 100)}%
            </span>
          </ProgressRing>
        </div>

        {resumeInfo && (
          <div className="resume-bar">
            <span className="resume-text">已从上次进度继续 · 剩余 {resumeInfo.remaining} 题</span>
            <button type="button" className="resume-restart" onClick={restart}>
              重新开始
            </button>
          </div>
        )}

        {finished ? (
          <div className="summary-card">
            <div className="summary-ico">
              <IconCheck />
            </div>
            <h3 className="summary-title">
              {totalMain === 0 ? '暂无卡片' : summary.unknown === 0 ? '本轮全部掌握' : '本轮结束'}
            </h3>
            <p className="summary-sub">
              {totalMain === 0
                ? '该数据包没有可练习的卡片'
                : `共练习 ${summary.reviewed} 张 · 掌握 ${summary.known} · 没记住 ${summary.unknown}`}
            </p>

            {totalMain > 0 && (
              <div className="summary-ring">
                <ProgressRing progress={accuracy / 100} size={108} stroke={10} color="var(--success)">
                  <div className="ring-center">
                    <span className="ring-pct" style={{ fontSize: 26 }}>
                      {accuracy}%
                    </span>
                    <span className="ring-cap">掌握率</span>
                  </div>
                </ProgressRing>
              </div>
            )}

            <div className="stack" style={{ marginTop: 18 }}>
              <Button
                variant="primary"
                block
                onClick={() => setRunId((r) => r + 1)}
                icon={<IconRepeat />}
              >
                再来一轮
              </Button>
              <Button variant="default" block onClick={onExit} icon={<IconArrowLeft />}>
                返回牌库
              </Button>
            </div>
          </div>
        ) : current ? (
          <>
            <FlashCard
              question={current.question}
              answer={current.answer}
              flipped={flipped}
              choice={choice}
              onToggleChoice={choose}
            />

            <div className="study-actions">
              {!flipped ? (
                <>
                  <Button variant="danger-soft" block onClick={() => answer(false)} icon={<IconX />}>
                    不清楚
                  </Button>
                  <Button variant="primary" block onClick={() => answer(true)} icon={<IconCheck />}>
                    知道
                  </Button>
                </>
              ) : (
                <Button variant="primary" block onClick={next}>
                  {remaining > 0 ? '下一张' : '完成'}
                  <IconChevronRight />
                </Button>
              )}
            </div>

            <p className="study-foot muted">
              {localMode === 'mistake'
                ? '错题本模式：仅复习标记为「没记住」的卡片'
                : '「不清楚」的卡片会在后续随机再次出现'}
            </p>
          </>
        ) : null}
      </div>

      <Modal
        open={warn}
        onClose={() => setWarn(false)}
        title="退出练习？"
        variant="center"
        footer={
          <>
            <Button variant="default" onClick={() => setWarn(false)}>
              继续练习
            </Button>
            <Button variant="danger" onClick={onExit}>
              退出练习
            </Button>
          </>
        }
      >
        <div className="modal-warn">
          <p>
            退出后，本轮练习进度（已作答 <b>{answered}</b> 张 · 掌握 <b>{summary.known}</b> · 没记住{' '}
            <b>{summary.unknown}</b> · 剩余 <b>{remaining}</b> 张未练）将不会保存为完成记录。
          </p>
          <p className="muted">你已答卡片的「知道 / 不知道」掌握标记已写入错题本，不会丢失。</p>
        </div>
      </Modal>
    </div>
  )
}
