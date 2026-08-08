import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deletePackage, type CardRow, type PackageRow, type StudyMode } from '../lib/db'
import { registerBackHandler } from '../lib/back'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import Modal from './ui/Modal'
import Segmented from './ui/Segmented'
import ExportButton from './ExportButton'
import { IconChevronRight, IconEye, IconTrash } from './ui/icons'

interface Props {
  pkg: PackageRow | null
  onClose: () => void
  onStart: (mode: StudyMode) => void
  onPreview: (pkg: PackageRow) => void
}

const MODE_OPTIONS: { label: string; value: StudyMode }[] = [
  { label: '顺序', value: 'sequential' },
  { label: '随机', value: 'random' },
  { label: '错题本', value: 'mistake' },
]

const MODE_HINT: Record<StudyMode, string> = {
  sequential: '按数据包原有顺序逐题练习',
  random: '打乱顺序随机出题，已掌握的题不再出现',
  mistake: '只练习标记为「没记住」的卡片',
}

export default function DeckDetail({ pkg, onClose, onStart, onPreview }: Props) {
  const toast = useToast()
  const [mode, setMode] = useState<StudyMode>('sequential')
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)

  // 删除二次确认弹窗打开时，系统返回键先关闭它，而非直接退出详情
  useEffect(() => {
    if (!confirmDel) return
    return registerBackHandler(() => {
      setConfirmDel(false)
      return true
    })
  }, [confirmDel])

  const cards = useLiveQuery<CardRow[]>(
    () => (pkg ? db.cards.where('packageId').equals(pkg.id!).toArray() : Promise.resolve([] as CardRow[])),
    [pkg],
  )

  const stats = useMemo(() => {
    const s = { total: 0, known: 0, mistake: 0 }
    for (const c of cards ?? []) {
      s.total++
      if (c.status === 'known') s.known++
      if (c.status === 'mistake') s.mistake++
    }
    return s
  }, [cards])

  const onDelete = async () => {
    if (!pkg?.id) return
    setBusy(true)
    try {
      await deletePackage(pkg.id)
      toast.success('已删除数据包')
      setConfirmDel(false)
      onClose()
    } catch {
      toast.error('删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={!!pkg}
        onClose={onClose}
        title={pkg?.name ?? ''}
        footer={
          <Button
            variant="primary"
            block
            disabled={stats.total === 0}
            onClick={() => onStart(mode)}
            icon={<IconChevronRight />}
          >
            开始学习
          </Button>
        }
      >
        {pkg && (
          <div className="deck-detail">
            <div className="stat-grid cols-3">
              <div className="stat">
                <div className="stat-value tnum">{stats.total}</div>
                <div className="stat-sub">题目</div>
              </div>
              <div className="stat">
                <div className="stat-value tnum" style={{ color: 'var(--success)' }}>
                  {stats.known}
                </div>
                <div className="stat-sub">已掌握</div>
              </div>
              <div className="stat">
                <div className="stat-value tnum" style={{ color: 'var(--danger)' }}>
                  {stats.mistake}
                </div>
                <div className="stat-sub">没记住</div>
              </div>
            </div>

            <div className="field" style={{ marginTop: 4 }}>
              <span className="field-label">练习模式</span>
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {MODE_HINT[mode]}
            </p>

            <Button
              variant="soft"
              block
              disabled={stats.total === 0}
              icon={<IconEye />}
              onClick={() => pkg && onPreview(pkg)}
              style={{ marginTop: 14 }}
            >
              预览题目
            </Button>

            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <ExportButton packageId={pkg.id!} block label="导出本包" />
              <Button
                variant="danger-soft"
                block
                icon={<IconTrash />}
                onClick={() => setConfirmDel(true)}
              >
                删除
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        variant="center"
        title="删除数据包"
        footer={
          <>
            <Button variant="default" block onClick={() => setConfirmDel(false)}>
              取消
            </Button>
            <Button variant="danger" block loading={busy} onClick={onDelete} icon={<IconTrash />}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="muted">删除后该数据包及其学习记录将一并清除，且无法恢复。</p>
      </Modal>
    </>
  )
}
