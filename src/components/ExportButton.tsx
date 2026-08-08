import { useState } from 'react'
import { saveAs } from 'file-saver'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
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

/** Web 端回退：用浏览器下载 */
function downloadBlob(text: string, fname: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  saveAs(blob, fname)
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
      // 导出包含「学习进度 + 题目进度」的增强数据包
      const text = JSON.stringify(res.pkg, null, 2)
      const fname = `${res.name}.json`.replace(/[\\/:*?"<>|]/g, '_')

      if (Capacitor.isNativePlatform()) {
        try {
          await Filesystem.writeFile({
            path: `Download/${fname}`,
            data: text,
            directory: Directory.Documents,
            recursive: true,
          })
          toast.success('已导出到手机 Download 目录')
        } catch {
          // 原生写入失败（如权限）时回退到浏览器下载
          downloadBlob(text, fname)
          toast.success('已导出数据包')
        }
      } else {
        downloadBlob(text, fname)
        toast.success('已导出数据包')
      }
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
