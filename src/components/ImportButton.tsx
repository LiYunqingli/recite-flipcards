import { useRef, useState } from 'react'
import { importPackageFile } from '../lib/db'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import { IconUpload } from './ui/icons'

interface Props {
  variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'danger-soft' | 'soft'
  block?: boolean
  size?: 'md' | 'sm'
  label?: string
  /** 渲染为右下角悬浮按钮（不显示文字） */
  fab?: boolean
  onImported?: (name: string) => void
}

export default function ImportButton({
  variant = 'primary',
  block,
  size = 'md',
  label = '导入数据包',
  fab,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const pick = () => inputRef.current?.click()

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const res = await importPackageFile(file)
      if (res.ok) {
        toast.success(`已导入：${res.name}`)
        onImported?.(res.name ?? '')
      } else {
        toast.error(res.error ?? '导入失败')
      }
    } catch {
      toast.error('导入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onChange}
      />
      {fab ? (
        <button
          className="fab"
          onClick={pick}
          disabled={busy}
          aria-label="导入数据包"
          data-tip="导入数据包"
        >
          {busy ? <span className="btn-spin" /> : <IconUpload />}
        </button>
      ) : (
        <Button
          variant={variant}
          block={block}
          size={size}
          loading={busy}
          icon={<IconUpload />}
          onClick={pick}
        >
          {label}
        </Button>
      )}
    </>
  )
}
