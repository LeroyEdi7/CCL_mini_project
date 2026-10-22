export function PasswordGuidance({ password, id = 'password-guidance' }: { password: string; id?: string }) {
  const checks = [
    { label: 'At least 12 characters', passed: password.length >= 12 },
    { label: 'No more than 128 characters', passed: password.length <= 128 },
  ]
  return <ul className="password-guidance" id={id} aria-label="Password requirements">
    {checks.map(({ label, passed }) => <li className={passed ? 'is-passed' : ''} key={label}>{label}</li>)}
  </ul>
}
