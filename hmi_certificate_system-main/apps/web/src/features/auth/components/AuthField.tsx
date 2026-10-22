import { useState, type ChangeEventHandler } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type AuthFieldProps = {
  id: string
  label: string
  name: string
  type?: 'email' | 'text' | 'password'
  autoComplete: string
  placeholder?: string
  descriptionId?: string
  error?: string
  required?: boolean
  minLength?: number
  maxLength?: number
  onChange?: ChangeEventHandler<HTMLInputElement>
}

export function AuthField({ id, label, name, type = 'text', autoComplete, error, descriptionId, ...inputProps }: AuthFieldProps) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input-wrap${isPassword ? ' is-password' : ''}`}>
        <input
          id={id}
          name={name}
          type={isPassword && visible ? 'text' : type}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? `${id}-error` : undefined, descriptionId].filter(Boolean).join(' ') || undefined}
          {...inputProps}
        />
        {isPassword && <button className="password-visibility" type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>}
      </div>
      {error && <span className="auth-field-error" id={`${id}-error`}>{error}</span>}
    </div>
  )
}
