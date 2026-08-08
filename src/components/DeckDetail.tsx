import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deletePackage, setPlan, type CardRow, type PackageRow, type StudyMode, type PackagePlan } from '../lib/db'
import { registerBackHandler } from '../lib/back'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import Modal from './ui/Modal'
import ExportButton from './ExportButton'
import PlanSetup from './PlanSetup'
import { IconChevronRight, IconEye, IconTrash, IconPlan } from './ui/icons'

interface Props {
  pkg: PackageRow | null
  onClose: () => void
  onStart: (mode: StudyMode) => void
  onPreview: (pkg: PackageRow) => void
}

export default function DeckDetail({ pkg, onClose, onStart, onPreview }: Props) {
  const toast = useToast()
  const [confirmDel, setConfirmDel] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [plan, setPlanState] = useState<PackagePlan | undefined>(pkg?.plan)

  // 删除二次确认弹窗打开时，系统返回键先关闭它，而非直接退出详情
  useEffect(() => {
    if (!confirmDel && !planOpen) return
    return registerBackHandler(() => {
      if (planOpen) setPlanOpen(false)
      else setConfirmDel(false)
      return true
    })
  }, [confirmDel, planOpen])

  // pkg 切换时同步本地计划快照
  useEffect(() => {
    setPlanState(pkg?.plan)
  }, [pkg])

  const cards = useLiveQuery<CardRow[]>(
    () => (pkg ? db.cards.where('packageId').equals(pkg.id!).toArray() : Promise.resolve([] as CardRow[])),
    [pkg],
  )

  const stats = (() => {
    const s = { total: 0, known: 0, mistake: 0, learning: 0 }
    for (const c of cards ?? []) {
      s.total++
      if (c.status === 'known') s.known++
      else if (c.status === 'mistake') s.mistake++
      else s.learning++
    }
    return s
  })()

  const onDelete = async () => {
    if (!pkg?.id) return
    try {
      await deletePackage(pkg.id)
      toast.success('已删除数据包')
      setConfirmDel(false)
      onClose()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleStart = () => {
    if (!pkg?.id) return
    if (!plan) {
      setPlanOpen(true)
      return
    }
    onStart('plan')
  }

  const handlePlanConfirm = async (p: PackagePlan) => {
    if (pkg?.id == null) return
    try {
      await setPlan(pkg.id, p)
      setPlanState(p)
      setPlanOpen(false)
      toast.success('计划已保存')
      onStart('plan')
    } catch {
      toast.error('保存计划失败')
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
            onClick={handleStart}
            icon={<IconChevronRight />}
          >
            {plan ? '开始每日练习' : '设置计划并开始'}
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

            {/* 每日练习计划（旧题 + 新题） */}
            <div className="plan-card">
              <div className="plan-card-head">
                <span className="plan-card-ico">
                  <IconPlan />
                </span>
                <span className="plan-card-title">每日练习计划</span>
                <button className="card-link" onClick={() => setPlanOpen(true)}>
                  修改
                </button>
              </div>
              {plan ? (
                <div className="plan-card-body">
                  <span className="plan-pill">每日 {plan.old} 道旧题</span>
                  <span className="plan-pill">每日 {plan.new} 道新题</span>
                  <span className="plan-pill soft">共 {plan.old + plan.new} 题 / 天</span>
                </div>
              ) : (
                <p className="muted plan-empty">尚未设置计划，开始练习前请先设定每日旧题 + 新题数量。</p>
              )}
            </div>

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

      {pkg && (
        <PlanSetup
          open={planOpen}
          initial={plan}
          onClose={() => setPlanOpen(false)}
          onConfirm={handlePlanConfirm}
        />
      )}

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
            <Button variant="danger" block onClick={onDelete} icon={<IconTrash />}>
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
