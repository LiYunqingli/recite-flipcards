import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'default' | 'ghost' | 'danger' | 'danger-soft' | 'soft'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  block?: boolean
  loading?: boolean
  icon?: ReactNode
  size?: 'md' | 'sm'
}

export default function Button({
  variant = 'default',
  block,
  loading,
  icon,
  size = 'md',
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  const cls = [
    'btn',
    `btn-${variant}`,
    block ? 'btn-block' : '',
    size === 'sm' ? 'btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="btn-spin" /> : icon}
      {children}
    </button>
  )
}
