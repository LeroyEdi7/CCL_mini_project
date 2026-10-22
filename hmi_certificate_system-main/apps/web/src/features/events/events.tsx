import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createEventSchema, updateEventSchema, EVENT_STATUSES, type EventCreateInput, type EventData, type EventListData } from '@hmi/shared'
import { apiFetch } from '../../lib/api-client'
import { EventCertificateManagement } from '../certificates/EventCertificateManagement'

type EventInput = EventCreateInput
const eventKey = ['events']
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const formatDate = (date: string) => new Date(date).toLocaleString()

function useEvents() {
  return useQuery({ queryKey: eventKey, queryFn: () => apiFetch<EventListData>('/events') })
}

export function EventListPage() {
  const events = useEvents()
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  return <EventsLayout title="Events">{notice && <p className="notice success" role="status">{notice}</p>}<div className="flex items-center justify-between gap-4"><p>Events you can access.</p><Link className="primary-link" to="/events/new">Create event</Link></div>
    {events.isLoading ? <p role="status">Loading events…</p> : events.error ? <p className="notice error" role="alert">{friendlyError(events.error)}</p> : events.data?.events.length ? <ul className="event-list">{events.data.events.map((event) => <li key={event.id}><Link to={`/events/${event.id}`}><strong>{event.name}</strong><span>{formatDate(event.startDate)} · {event.status} · {event.accessRole}</span></Link></li>)}</ul> : <p>No events yet. Create one to get started.</p>}
  </EventsLayout>
}

export function EventDetailsPage() {
  const { eventId = '' } = useParams()
  const event = useQuery({ queryKey: [...eventKey, eventId], queryFn: () => apiFetch<EventData>(`/events/${eventId}`) })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const archive = useMutation({ mutationFn: () => apiFetch<EventData>(`/events/${eventId}`, { method: 'DELETE' }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: eventKey }); navigate('/events', { state: { notice: 'Event archived. Participant and certificate history was retained.' } }) } })
  if (event.isLoading) return <EventsLayout title="Event"><p role="status">Loading event…</p></EventsLayout>
  if (event.error || !event.data) return <EventsLayout title="Event"><p className="notice error" role="alert">{friendlyError(event.error)}</p><Link to="/events">Back to events</Link></EventsLayout>
  const item = event.data.event
  const notice = (location.state as { notice?: string } | null)?.notice
  return <EventsLayout title={item.name}>{notice && <p className="notice success" role="status">{notice}</p>}<p>{item.description || 'No description provided.'}</p><dl className="event-details"><dt>Starts</dt><dd>{formatDate(item.startDate)}</dd><dt>Ends</dt><dd>{item.endDate ? formatDate(item.endDate) : 'Not specified'}</dd><dt>Status</dt><dd>{item.status}</dd><dt>Your access</dt><dd>{item.accessRole}</dd></dl>
    {item.accessRole === 'admin' && <EventCertificateManagement eventId={item.id} />}
    {archive.error && <p className="notice error" role="alert">{friendlyError(archive.error)}</p>}
    <div className="event-actions"><Link className="primary-link" to="/events">All events</Link>{item.accessRole === 'admin' && <><Link className="primary-link" to={`/events/${item.id}/edit`}>Edit</Link><button className="danger-link" disabled={archive.isPending} onClick={() => { if (window.confirm('Archive this event? Its participant and certificate history will be retained.')) archive.mutate() }}>{archive.isPending ? 'Archiving…' : 'Archive event'}</button></>}</div>
  </EventsLayout>
}

export function EventFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { eventId = '' } = useParams()
  const edit = mode === 'edit'
  const existing = useQuery({ queryKey: [...eventKey, eventId], queryFn: () => apiFetch<EventData>(`/events/${eventId}`), enabled: edit })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [validation, setValidation] = useState('')
  const mutation = useMutation({
    mutationFn: (input: EventInput) => apiFetch<EventData>(edit ? `/events/${eventId}` : '/events', { method: edit ? 'PATCH' : 'POST', body: JSON.stringify(input) }),
    onSuccess: async ({ event }) => { await queryClient.invalidateQueries({ queryKey: eventKey }); navigate(`/events/${event.id}`, { state: { notice: edit ? 'Event updated successfully.' : 'Event created successfully.' } }) },
  })
  if (edit && existing.isLoading) return <EventsLayout title="Edit event"><p role="status">Loading event…</p></EventsLayout>
  if (edit && (existing.error || !existing.data || existing.data.event.accessRole !== 'admin')) return <EventsLayout title="Edit event"><p className="notice error" role="alert">{existing.error ? friendlyError(existing.error) : 'Event admin access is required.'}</p><Link to="/events">Back to events</Link></EventsLayout>
  const item = existing.data?.event
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation('')
    const form = new FormData(event.currentTarget)
    const startValue = String(form.get('startDate') ?? '')
    const endValue = String(form.get('endDate') ?? '')
    const rawInput: EventInput = { name: String(form.get('name') ?? ''), description: String(form.get('description') ?? '').trim() || null, startDate: localDateTimeToIso(startValue), endDate: endValue ? localDateTimeToIso(endValue) : null, status: String(form.get('status') ?? 'draft') as EventInput['status'] }
    const parsed = (edit ? updateEventSchema : createEventSchema).safeParse(rawInput)
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? 'Please check the event details.'); return }
    mutation.mutate(parsed.data as EventInput)
  }
  return <EventsLayout title={edit ? 'Edit event' : 'Create event'}><form className="auth-form" onSubmit={submit}>
    <label className="field">Event name<input name="name" required maxLength={200} defaultValue={item?.name} /></label>
    <label className="field">Description<textarea name="description" rows={4} maxLength={5000} defaultValue={item?.description ?? ''} /></label>
    <label className="field">Starts<input name="startDate" type="datetime-local" required defaultValue={item ? toLocalInput(item.startDate) : ''} /></label>
    <label className="field">Ends<input name="endDate" type="datetime-local" defaultValue={item?.endDate ? toLocalInput(item.endDate) : ''} /></label>
    <label className="field">Status<select name="status" defaultValue={item?.status ?? 'draft'}>{EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    {validation && <p className="notice error" role="alert">{validation}</p>}{mutation.error && <p className="notice error" role="alert">{friendlyError(mutation.error)}</p>}
    {mutation.isSuccess && <p className="notice success" role="status">Event saved.</p>}
    <button disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Saving…' : edit ? 'Save changes' : 'Create event'}</button><Link to={edit && item ? `/events/${item.id}` : '/events'}>Cancel</Link>
  </form></EventsLayout>
}

function toLocalInput(value: string) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
function localDateTimeToIso(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : value }
function EventsLayout({ title, children }: { title: string; children: React.ReactNode }) { return <main className="auth-shell"><section className="auth-card event-card"><p className="eyebrow">HMI CERTIFICATES</p><h1>{title}</h1>{children}</section></main> }
