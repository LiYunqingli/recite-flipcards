import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface PushOptions {
  /** 持续时间（毫秒）。默认 2400。失败/警告场景可设 6000-8000 看清提示。 */
  duration?: number
}

type PushFn = (type: ToastType, message: string, opts?: PushOptions) => void

const ToastCtx = createContext<PushFn>(() => {})

export function useToast() {
  const push = useContext(ToastCtx)
  return {
    success: (m: string, opts?: PushOptions) => push('success', m, opts),
    error: (m: string, opts?: PushOptions) => push('error', m, opts),
    info: (m: string, opts?: PushOptions) => push('info', m, opts),
    warning: (m: string, opts?: PushOptions) => push('warning', m, opts),
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const push = useCallback<PushFn>((type, message, opts) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, type, message }])
    const ms = opts?.duration ?? 2400
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, ms)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toast-wrap" aria-live="polite" role="status">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}