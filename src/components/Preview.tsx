import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getCardAttempts,
  updateCard,
  type AttemptRow,
  type CardRow,
  type CardStatus,
  type PackageRow,
  type StudyMode,
} from '../lib/db'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import Modal from './ui/Modal'
import { IconActivity, IconArrowLeft, IconEdit, IconSearch, IconX } from './ui/icons'

type StatusFilter = 'all' | CardStatus

const STATUS_LABEL: Record<CardStatus, string> = {
  known: '已掌握',
  mistake: '没记住',
  new: '未练习',
}
const STATUS_CLASS: Record<CardStatus, string> = {
  known: 'known',
  mistake: 'unknown',
  new: 'fresh',
}
const MODE_LABEL: Record<StudyMode, string> = {
  plan: '每日计划',
  mistake: '错题本',
}

interface Props {
  pkg: PackageRow
  onBack: () => void
  onStartStudy: () => void
}

function relTime(ts?: number): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

function truncate(s: string, n = 40): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export default function Preview({ pkg, onBack, onStartStudy }: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editing, setEditing] = useState<CardRow | null>(null)

  const cards = useLiveQuery<CardRow[]>(
    () =>
      pkg.id != null
        ? db.cards.where('packageId').equals(pkg.id).sortBy('order')
        : Promise.resolve([] as CardRow[]),
    [pkg.id],
  ) ?? []

  const summary = useMemo(() => {
    const s = { total: 0, known: 0, mistake: 0, fresh: 0, reviewed: 0, correct: 0, missed: 0 }
    for (const c of cards) {
      s.total++
      if (c.status === 'known') s.known++
      else if (c.status === 'mistake') s.mistake++
      else s.fresh++
      s.reviewed += c.reviewed
      s.correct += c.correct
      s.missed += c.missed
    }
    return s
  }, [cards])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (q && !`${c.question} ${c.answer}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [cards, query, statusFilter])

  const accuracy = summary.reviewed ? Math.round((summary.correct / summary.reviewed) * 100) : 0

  return (
    <div className="study-screen preview-screen">
      <header className="app-header study-header">
        <button className="btn btn-ghost btn-icon" onClick={onBack} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="study-title">{pkg.name}</div>
        <button className="btn btn-ghost btn-icon" onClick={onStartStudy} aria-label="开始练习">
          <IconActivity />
        </button>
      </header>

      <div className="app-content study-content">
        {/* 概览统计 */}
        <div className="prev-summary">
          <div className="prev-stat">
            <b className="tnum">{summary.total}</b>
            <span>题目</span>
          </div>
          <div className="prev-stat">
            <b className="tnum" style={{ color: 'var(--success)' }}>
              {summary.known}
            </b>
            <span>已掌握</span>
          </div>
          <div className="prev-stat">
            <b className="tnum" style={{ color: 'var(--danger)' }}>
              {summary.mistake}
            </b>
            <span>没记住</span>
          </div>
          <div className="prev-stat">
            <b className="tnum">{summary.fresh}</b>
            <span>未练习</span>
          </div>
          <div className="prev-stat">
            <b className="tnum">{summary.reviewed}</b>
            <span>总作答</span>
          </div>
          <div className="prev-stat">
            <b className="tnum">{accuracy}%</b>
            <span>掌握率</span>
          </div>
        </div>

        {/* 搜索 + 筛选 */}
        <div className="prev-tools">
          <div className="prev-search">
            <IconSearch />
            <input
              className="prev-searchinput"
              placeholder="搜索题目或答案…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="prev-searchclear" onClick={() => setQuery('')} aria-label="清除">
                <IconX />
              </button>
            )}
          </div>
          <div className="prev-chips">
            {(['all', 'known', 'mistake', 'new'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                className={`prev-chip ${statusFilter === s ? 'on' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? '全部' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 题目列表 */}
        <div className="prev-list">
          {filtered.length === 0 ? (
            <div className="prev-empty muted">没有匹配的题目</div>
          ) : (
            filtered.map((c) => {
              const acc = c.reviewed ? Math.round((c.correct / c.reviewed) * 100) : 0
              return (
                <div
                  key={c.id}
                  className="prev-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setEditing(c)
                    }
                  }}
                >
                  <div className="prev-itemhead">
                    <span className={`prev-dot ${STATUS_CLASS[c.status]}`} />
                    <span className="prev-index tnum">#{c.order + 1}</span>
                    <span className="prev-type">{c.type || '题目'}</span>
                    <span className="prev-editicon">
                      <IconEdit />
                    </span>
                  </div>
                  <p className="prev-q" title={c.question}>{truncate(c.question)}</p>
                  <div className="prev-meta">
                    <span>复习 {c.reviewed}</span>
                    <span className="prev-ok">对 {c.correct}</span>
                    <span className="prev-bad">错 {c.missed}</span>
                    <span className="prev-acc">掌握 {acc}%</span>
                  </div>
                  <div className="prev-accbar">
                    <span style={{ width: `${acc}%` }} />
                  </div>
                  <div className="prev-time muted">上次作答 {relTime(c.lastSeenAt)}</div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {editing && (
        <CardEditor
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => setEditing(updated)}
        />
      )}
    </div>
  )
}

interface EditorProps {
  card: CardRow
  onClose: () => void
  onSaved: (c: CardRow) => void
}

function CardEditor({ card, onClose, onSaved }: EditorProps) {
  const toast = useToast()
  const [question, setQuestion] = useState(card.question)
  const [answer, setAnswer] = useState(card.answer)
  const [type, setType] = useState(card.type ?? '')
  const [status, setStatus] = useState<CardStatus>(card.status)
  const [saving, setSaving] = useState(false)

  const attempts = useLiveQuery<AttemptRow[]>(
    () => (card.id != null ? getCardAttempts(card.id) : Promise.resolve([] as AttemptRow[])),
    [card.id],
  ) ?? []

  const dirty =
    question !== card.question ||
    answer !== card.answer ||
    type !== (card.type ?? '') ||
    status !== card.status

  const onSave = async () => {
    if (card.id == null) return
    const q = question.trim()
    if (!q) {
      toast.error('题目不能为空')
      return
    }
    const t = type.trim() || undefined
    setSaving(true)
    try {
      await updateCard(card.id, { question: q, answer, type: t, status })
      onSaved({ ...card, question: q, answer, type: t, status })
      toast.success('已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`编辑题目 #${card.order + 1}`}
      variant="center"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={onSave}>
            保存
          </Button>
        </>
      }
    >
      <div className="prev-editor">
        <div className="prev-field">
          <span className="field-label">题目</span>
          <textarea
            className="prev-ta"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
          />
        </div>
        <div className="prev-field">
          <span className="field-label">答案</span>
          <textarea
            className="prev-ta"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
          />
        </div>
        <div className="prev-fieldrow">
          <div className="prev-field">
            <span className="field-label">类型</span>
            <input
              className="prev-inp"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="可选，如 单选 / 简答"
            />
          </div>
          <div className="prev-field">
            <span className="field-label">掌握状态</span>
            <div className="prev-chips">
              {(['known', 'mistake', 'new'] as CardStatus[]).map((s) => (
                <button
                  key={s}
                  className={`prev-chip ${status === s ? 'on ' + STATUS_CLASS[s] : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="prev-history">
          <div className="prev-historyhead">
            <IconActivity />
            <span>历史答题（{attempts.length}）</span>
          </div>
          {attempts.length === 0 ? (
            <p className="muted">暂无作答记录</p>
          ) : (
            <ul className="prev-historylist">
              {attempts.map((a) => (
                <li key={a.id}>
                  <span className={`prev-hdot ${a.known ? 'known' : 'unknown'}`} />
                  <span className="prev-hresult">{a.known ? '知道' : '不知道'}</span>
                  <span className="prev-hmode">{a.mode ? MODE_LABEL[a.mode] : ''}</span>
                  <span className="prev-htime tnum">
                    {new Date(a.at).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
