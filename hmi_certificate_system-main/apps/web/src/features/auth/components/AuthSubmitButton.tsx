import type { ReactNode } from 'react'

export function AuthSubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Please wait…' : children}</button>
}
