import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { clearAll, db } from '../lib/db'
import { registerBackHandler } from '../lib/back'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import Modal from './ui/Modal'
import ImportButton from './ImportButton'
import ExportButton from './ExportButton'
import { IconTrash } from './ui/icons'

export default function Me() {
  const packages = useLiveQuery(() => db.packages.orderBy('importedAt').reverse().toArray())
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  // 清空数据二次确认弹窗打开时，系统返回键先关闭它
  useEffect(() => {
    if (!confirm) return
    return registerBackHandler(() => {
      setConfirm(false)
      return true
    })
  }, [confirm])

  const onClear = async () => {
    setBusy(true)
    try {
      await clearAll()
      toast.success('已清空所有数据')
      setConfirm(false)
    } catch {
      toast.error('清空失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="section-head">
        <h2 className="screen-title">我的</h2>
        <span className="screen-sub">数据 · 关于</span>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            数据管理
          </div>
        </div>
        <ImportButton variant="primary" block label="导入数据包（.json）" />
        <div className="kv-list" style={{ marginTop: 14 }}>
          {!packages ? null : packages.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: '10px 0' }}>
              暂无数据包
            </div>
          ) : (
            packages.map((p) => (
              <div key={p.id} className="list-row">
                <span className="lr-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                  {p.name}
                </span>
                <ExportButton packageId={p.id!} variant="ghost" size="sm" label="导出" />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            关于
          </div>
        </div>
        <div className="about">
          <div className="about-logo">◆</div>
          <div className="about-name">翻牌背题</div>
          <p className="muted about-desc">
            离线问答背题工具：顺序 / 随机 / 错题本多种模式，
            翻牌即看答案，「不清楚」自动收入错题本并在后续随机复现。
            数据全部保存在本机数据库，无需联网。
          </p>
          <div className="kv">
            <span className="k">存储</span>
            <span className="v">IndexedDB（离线）</span>
          </div>
          <div className="kv">
            <span className="k">技术栈</span>
            <span className="v">React · Vite · Capacitor</span>
          </div>
          <div className="kv">
            <span className="k">版本</span>
            <span className="v">1.0.0</span>
          </div>
        </div>
      </div>

      <div className="card danger-card">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" style={{ background: 'var(--danger)' }} />
            危险区
          </div>
        </div>
        <Button
          variant="danger-soft"
          block
          icon={<IconTrash />}
          onClick={() => setConfirm(true)}
        >
          清空所有数据
        </Button>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        variant="center"
        title="清空所有数据"
        footer={
          <>
            <Button variant="default" block onClick={() => setConfirm(false)}>
              取消
            </Button>
            <Button variant="danger" block loading={busy} onClick={onClear} icon={<IconTrash />}>
              确认清空
            </Button>
          </>
        }
      >
        <p className="muted">
          此操作将删除全部数据包与学习记录，且无法恢复。确定要继续吗？
        </p>
      </Modal>
    </div>
  )
}
