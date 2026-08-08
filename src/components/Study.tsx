import { useEffect, useRef, useState } from 'react'
import {
  db,
  recordAnswer,
  getPlan,
  buildDailyPlan,
  getProgress,
  saveProgress,
  clearProgress,
  KNOWN_STREAK,
  type CardRow,
  type StudyMode,
} from '../lib/db'
import { useTheme } from '../lib/theme'
import { registerBackHandler } from '../lib/back'
import Button from './ui/Button'
import ProgressRing from './ui/ProgressRing'
import FlashCard from './FlashCard'
import Modal from './ui/Modal'
import { IconArrowLeft, IconCheck, IconChevronRight, IconMoon, IconSun, IconX, IconPlan, IconMistake, IconRefresh } from './ui/icons'

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
          const rq = (prog.queue ?? []).filter((id) => map[id] != null)
          const rp = (prog.pending ?? []).filter((id) => map[id] != null)
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
          // 错题本：所有 status === 'mistake' 的卡片，随机顺序
          initQueue = cards.filter((c) => c.status === 'mistake').map((c) => c.id!)
        } else {
          // 每日计划：旧题（最近易错 + 艾宾浩斯到期）+ 新题，最后随机
          const plan = (await getPlan(packageId)) ?? { old: 10, new: 10 }
          initQueue = await buildDailyPlan(packageId, plan)
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

  // 翻牌作答：先翻面并显示答案，落库推迟到「下一张」以统一处理 3 次正确机制
  const answer = (known: boolean) => {
    if (!current || flipped || choice) return
    setFlipped(true)
    setChoice(known ? 'known' : 'unknown')
    setSummary((s) => ({
      reviewed: s.reviewed + 1,
      known: s.known + (known ? 1 : 0),
      unknown: s.unknown + (known ? 0 : 1),
    }))
  }

  // 翻面后改判：把本题直接判为 知道/不知道（仅调整本次展示，落库仍在下一张）
  const choose = (know: boolean) => {
    if (!current || !choice || !flipped) return
    const target = know ? 'known' : 'unknown'
    if (choice === target) return
    const wasKnown = choice === 'known'
    setChoice(target)
    setSummary((s) => ({
      reviewed: s.reviewed,
      known: s.known + (know ? 1 : 0) - (wasKnown ? 1 : 0),
      unknown: s.unknown + (know ? 0 : 1) - (!wasKnown ? 1 : 0),
    }))
  }

  const next = () => {
    if (!current || !choice) return
    const known = choice === 'known'
    const cardId = current.id!

    // 落库：更新 streak / status / 艾宾浩斯调度，并记录作答
    void recordAnswer(cardId, known, localMode).then((updated) => {
      // 同步最新卡片状态，使复现时的「连对 x/3」提示保持准确
      if (updated) setCardsMap((m) => ({ ...m, [cardId]: updated }))
      // 错误重复机制：
      // · 「不清楚」→ 随机插入待重练队列，稍后再次出现；
      // · 「知道」且在错题本模式且尚未满 3 次正确 → 继续重练直到掌握。
      setPending((p) => {
        if (!known) {
          const next = p.slice()
          const idx = Math.floor(Math.random() * (next.length + 1))
          next.splice(idx, 0, cardId)
          return next
        }
        if (localMode === 'mistake' && updated && updated.status !== 'known') {
          const next = p.slice()
          const idx = Math.floor(Math.random() * (next.length + 1))
          next.splice(idx, 0, cardId)
          return next
        }
        return p
      })
    })

    // 推进到下一张
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
  const currentStreak = current?.streak ?? 0

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
                ? localMode === 'mistake'
                  ? '当前没有需要复习的错题'
                  : '该数据包没有可练习的卡片'
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
                icon={<IconRefresh />}
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
              {localMode === 'mistake' ? (
                <>
                  <IconMistake style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 3 }} />
                  错题本：连续答对 <b>{KNOWN_STREAK}</b> 次才掌握，答错会再次出现
                </>
              ) : (
                <>
                  <IconPlan style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 3 }} />
                  每日计划练习 · 连续答对 <b>{KNOWN_STREAK}</b> 次才掌握，答错随机复现
                </>
              )}
              {flipped && currentStreak > 0 && (
                <span className="streak-badge">本题已连对 {currentStreak}/{KNOWN_STREAK}</span>
              )}
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
