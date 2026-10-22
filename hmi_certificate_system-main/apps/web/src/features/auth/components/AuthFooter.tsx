import type { ReactNode } from 'react'

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="auth-feature-footer">{children}</p>
}
