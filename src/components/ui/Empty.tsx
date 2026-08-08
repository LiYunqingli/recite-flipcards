import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  text: string
  action?: ReactNode
}

export default function Empty({ icon, text, action }: Props) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <div className="empty-text">{text}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
