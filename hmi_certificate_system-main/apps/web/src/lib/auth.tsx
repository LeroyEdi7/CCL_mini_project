import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest, type User } from './api-client'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const result = await apiRequest<{ user: User }>('/me')
      setUser(result.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])
  const logout = useCallback(async () => {
    await apiRequest('/logout', { method: 'POST' })
    setUser(null)
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])
  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

