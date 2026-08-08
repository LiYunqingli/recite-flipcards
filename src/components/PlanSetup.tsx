import { useEffect, useState } from 'react'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import Modal from './ui/Modal'
import { IconPlan, IconBook, IconSparkles, IconRefresh } from './ui/icons'
import type { PackagePlan } from '../lib/db'

interface Props {
  open: boolean
  initial?: PackagePlan
  onClose: () => void
  onConfirm: (plan: PackagePlan) => void
}

/** 「从已提供的列表中选择」的预设值 */
const OLD_OPTIONS = [5, 10, 15, 20, 30]
const NEW_OPTIONS = [5, 10, 15, 20, 30]

export default function PlanSetup({ open, initial, onClose, onConfirm }: Props) {
  const toast = useToast()
  const [oldN, setOldN] = useState(initial?.old ?? 10)
  const [newN, setNewN] = useState(initial?.new ?? 10)

  useEffect(() => {
    if (open) {
      setOldN(initial?.old ?? 10)
      setNewN(initial?.new ?? 10)
    }
  }, [open, initial])

  const confirm = () => {
    if (oldN <= 0 && newN <= 0) {
      toast.error('旧题和新题至少设置一项')
      return
    }
    onConfirm({ old: oldN, new: newN })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="设置每日练习计划"
      variant="center"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={confirm} icon={<IconPlan />}>
            保存并开始
          </Button>
        </>
      }
    >
      <p className="muted plan-tip">
        没有学习计划时，先设定每日的「旧题 + 新题」数量。旧题会优先安排最近易错的题目，
        再按艾宾浩斯遗忘曲线复习到期内容；新题每天少量递增，最后随机出题。
      </p>

      <div className="field" style={{ marginTop: 6 }}>
        <span className="field-label">
          <IconRefresh style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
          每日旧题（复习）
        </span>
        <div className="plan-chips">
          {OLD_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`preset ${oldN === n ? 'on' : ''}`}
              onClick={() => setOldN(n)}
            >
              {n} 题
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          <IconSparkles style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 4 }} />
          每日新题（学习）
        </span>
        <div className="plan-chips">
          {NEW_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={`preset ${newN === n ? 'on' : ''}`}
              onClick={() => setNewN(n)}
            >
              {n} 题
            </button>
          ))}
        </div>
      </div>

      <div className="plan-summary">
        <span className="plan-summary-ico">
          <IconBook />
        </span>
        每天约 <b>{oldN + newN}</b> 题 · {oldN} 旧 + {newN} 新
      </div>
    </Modal>
  )
}
