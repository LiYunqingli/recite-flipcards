import { useState } from 'react'
import { saveAs } from 'file-saver'
import { exportPackageRaw } from '../lib/db'
import { useToast } from '../lib/toast'
import Button from './ui/Button'
import { IconDownload } from './ui/icons'

interface Props {
  packageId: number
  variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'danger-soft' | 'soft'
  block?: boolean
  size?: 'md' | 'sm'
  label?: string
  onExported?: () => void
}

export default function ExportButton({
  packageId,
  variant = 'default',
  block,
  size = 'md',
  label = '导出本包',
  onExported,
}: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const onClick = async () => {
    setBusy(true)
    try {
      const res = await exportPackageRaw(packageId)
      if (!res) {
        toast.error('数据包不存在')
        return
      }
      // 仅按「原先导入的数据包」原样导出
      const blob = new Blob([JSON.stringify(res.raw, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const fname = `${res.name}.json`.replace(/[\\/:*?"<>|]/g, '_')
      saveAs(blob, fname)
      toast.success('已导出数据包')
      onExported?.()
    } catch {
      toast.error('导出失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant={variant}
      block={block}
      size={size}
      loading={busy}
      icon={<IconDownload />}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
