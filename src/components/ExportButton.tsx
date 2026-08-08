import { useState } from 'react'
import { saveAs } from 'file-saver'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
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

/** Web 端：浏览器直接下载 */
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
      const result = await exportPackageRaw(packageId)
      if (!result) {
        toast.error('数据包不存在')
        return
      }
      const text = JSON.stringify(result.pkg, null, 2)
      const d = new Date()
      const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
      ).padStart(2, '0')}`
      const fname = `recite_${result.name}_${ds}.json`.replace(/[\\/:*?"<>|]/g, '_')

      if (Capacitor.isNativePlatform()) {
        // 原生平台：写入缓存 → 系统分享面板，用户可选择「保存到下载」等任意目标
        await Filesystem.writeFile({
          path: fname,
          data: text,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        const { uri } = await Filesystem.getUri({ path: fname, directory: Directory.Cache })
        try {
          await Share.share({
            title: fname,
            files: [uri],
            dialogTitle: '保存导出文件',
          })
          toast.success(`已导出：${fname}`)
        } catch {
          // 用户取消分享
          toast.info('已取消导出')
        }
      } else {
        downloadBlob(text, fname)
        toast.success(`已导出数据包：${fname}`)
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