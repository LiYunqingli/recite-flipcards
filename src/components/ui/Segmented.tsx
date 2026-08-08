interface Option<T> {
  label: string
  value: T
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}

function Segmented<T extends string>({ options, value, onChange, className = '' }: Props<T>) {
  return (
    <div className={`segmented ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg-item ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default Segmented
