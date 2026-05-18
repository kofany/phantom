import { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className={`input-group ${error ? 'has-error' : ''}`}>
      {label && <label>{label}</label>}
      <input className={`input ${className}`} {...props} />
      {error && <span className="input-error">{error}</span>}
    </div>
  )
}
