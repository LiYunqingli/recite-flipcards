import type { ReactNode } from 'react'

interface Props {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}

export default function Field({ label, hint, htmlFor, children }: Props) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}
