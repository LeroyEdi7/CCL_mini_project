import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, Bell, CalendarDays, ChevronDown, FileBadge, LayoutDashboard, Search, Settings, Users, WandSparkles } from 'lucide-react'
import { useAuth } from '../../../lib/use-auth'

const adminNavigation = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
  { to: '/admin/participants', label: 'Participants', icon: Users },
  { to: '/admin/certificates', label: 'Certificates', icon: FileBadge },
  { to: '/admin/templates', label: 'Templates', icon: WandSparkles },
  { to: '/admin/activity', label: 'Activity log', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminLayout({ children, roleLabel = 'Admin', title = 'Dashboard' }: { children: ReactNode; roleLabel?: string; title?: string }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><NavLink className="certify-wordmark" to="/admin/dashboard">Certify</NavLink><span className="admin-role-pill">{roleLabel}</span></div>
      <nav aria-label="Administration">
        {adminNavigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}
      </nav>
      <div className="admin-user-block">
        <div className="admin-user-summary"><span className="account-avatar">{user?.name?.slice(0, 1) ?? 'A'}</span><span><strong>{user?.name ?? 'Administrator'}</strong><small>{roleLabel}</small></span><ChevronDown size={16} aria-hidden="true" /></div>
        <button type="button" onClick={async () => { await logout(); navigate('/login') }}>Sign out</button>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <h1 className="admin-topbar-title">{title}</h1>
        <label className="admin-global-search"><Search aria-hidden="true" /><span className="visually-hidden">Search events, participants, certificates</span><input placeholder="Search events, participants, certificates" /></label>
        <div className="admin-topbar-actions"><button className="admin-create-event" type="button" onClick={() => navigate('/admin/events/new')}>+ Create event</button><button className="admin-icon-button" type="button" aria-label="Notifications"><Bell aria-hidden="true" /></button></div>
      </header>
      <main className="admin-page-content">{children}</main>
    </div>
  </div>
}
