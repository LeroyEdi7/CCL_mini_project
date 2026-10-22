export function AuthFormHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="auth-form-header"><h2>{title}</h2><p>{subtitle}</p></header>
}
