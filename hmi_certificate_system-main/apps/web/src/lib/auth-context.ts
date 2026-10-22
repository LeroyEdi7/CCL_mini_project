import { createContext } from 'react'
import type { User } from './api-client'

export type AuthContextValue = { user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
export const AuthContext = createContext<AuthContextValue | null>(null)
