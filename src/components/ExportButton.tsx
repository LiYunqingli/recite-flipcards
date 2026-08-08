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
      const d = new Date()
      const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
      ).padStart(2, '0')}`
      // 文件名加 recite_ 前缀 + 日期，便于在文件管理器中定位
      const fname = `recite_${res.name}_${ds}.json`.replace(/[\\/:*?"<>|]/g, '_')

      if (Capacitor.isNativePlatform()) {
        try {
          // 注意：本机 @capacitor/filesystem 为 8.1.2，其 Directory 枚举没有 Downloads，
          // 且 Android 11+ 作用域存储下 ExternalStorage 不可访问。唯一对用户可见的
          // 公共目录是 Documents（文件管理器的「文档」分类），故导出到 Documents 根。
          await Filesystem.writeFile({
            path: fname,
            data: text,
            directory: Directory.Documents,
          })
          toast.success('已导出到手机「文档」目录（文件名以 recite_ 开头）')
        } catch {
          // 原生写入失败（如权限被拒）时回退到浏览器下载
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
