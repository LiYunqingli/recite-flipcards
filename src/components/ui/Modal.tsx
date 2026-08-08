import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  variant?: 'sheet' | 'center'
  grabber?: boolean
}

const EXIT_MS = 260 // 与退场动画时长保持一致
const DRAG_THRESHOLD = 110 // 下滑超过该像素则关闭
const DRAG_VELOCITY = 24 // 轻快下滑（小位移 + 短时间）也关闭

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'sheet',
  grabber = true,
}: Props) {
  const [render, setRender] = useState(open)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const startTime = useRef(0)

  // 控制挂载生命周期：open=true 立即挂载并播放入场；open=false 播放退场动画后再卸载
  useEffect(() => {
    if (open) {
      setRender(true)
      setClosing(false)
      setDragY(0)
    } else if (render) {
      setClosing(true)
      const t = setTimeout(() => setRender(false), EXIT_MS)
      return () => clearTimeout(t)
    }
    // 仅关注 open 变化；render 为当前渲染态，闭包内读取即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 展示期间锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!render) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [render, onClose])

  if (!render) return null

  // 顶部横条（grabber）跟手上下滑动：下滑超过阈值或快速下滑则关闭
  const onGrabDown = (e: ReactPointerEvent) => {
    if (variant !== 'sheet') return
    startY.current = e.clientY
    startTime.current = Date.now()
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onGrabMove = (e: ReactPointerEvent) => {
    if (!dragging) return
    const dy = e.clientY - startY.current
    setDragY(Math.max(0, dy)) // 仅允许向下拖拽
  }
  const onGrabUp = (e: ReactPointerEvent) => {
    if (!dragging) return
    const dy = e.clientY - startY.current
    const dt = Date.now() - startTime.current
    setDragging(false)
    // 下滑超过阈值，或快速轻扫（小位移 + 短时间）即关闭，否则回弹
    if (dy > DRAG_THRESHOLD || (dy > DRAG_VELOCITY && dt < 240)) {
      onClose()
    } else {
      setDragY(0)
    }
  }

  const overlayAlpha = Math.max(0, 0.46 * (1 - dragY / 520))
  const rootStyle: CSSProperties = {
    background: `rgba(20, 18, 14, ${overlayAlpha})`,
  }
  const modalStyle: CSSProperties = {
    transform: dragY ? `translateY(${dragY}px)` : undefined,
    transition: dragging
      ? 'none'
      : 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)',
    cursor: dragging ? 'grabbing' : undefined,
  }

  return createPortal(
    <div
      className={`modal-root ${variant}${closing ? ' closing' : ''}`}
      style={rootStyle}
      onClick={onClose}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'sheet' && grabber && (
          <div
            className="modal-grabber"
            onPointerDown={onGrabDown}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabUp}
            onPointerCancel={onGrabUp}
          >
            <span className="modal-grabber-bar" />
          </div>
        )}
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
