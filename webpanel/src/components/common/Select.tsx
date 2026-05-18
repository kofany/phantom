import { SelectHTMLAttributes } from 'react'

type Option = {
  value: string
  label: string
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  options: Option[]
  error?: string
}

export function Select({ label, options, error, className = '', ...props }: SelectProps) {
  return (
    <div className={`input-group ${error ? 'has-error' : ''}`}>
      {label && <label>{label}</label>}
      <select className={`select ${className}`} {...props}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="input-error">{error}</span>}
    </div>
  )
}
