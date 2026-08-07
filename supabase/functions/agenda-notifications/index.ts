import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import webpush from 'npm:web-push@3.6.7'

type Candidate = {
  subscription_id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  delivery_key: string
  kind: 'event' | 'task' | 'summary' | 'routine' | 'change' | 'departure' | 'overdue' | 'snooze'
  title: string
  body: string
  url: string
  tag: string
  entity_type: 'event' | 'task' | 'routine' | null
  entity_id: string | null
  snooze_minutes: number | null
}

const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Secret manquant: ${name}`)
  return value
}

const actionsFor = (item: Candidate) => {
  const actions: Array<{ action: string; title: string }> = []
  const canSnooze = Boolean(item.entity_type && item.entity_id && ['event', 'task', 'routine', 'departure', 'overdue', 'snooze'].includes(item.kind))
  if (item.entity_type === 'task' && ['task', 'overdue', 'snooze'].includes(item.kind)) {
    actions.push({ action: 'complete-task', title: 'Terminer' })
  }
  if (canSnooze && actions.length < 2) {
    actions.push({ action: 'snooze', title: `Reporter ${item.snooze_minutes || 30} min` })
  }
  return actions
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    try {
      const cronSecret = required('CRON_SECRET')
      if (req.headers.get('x-cron-secret') !== cronSecret) {
        return new Response('Unauthorized', { status: 401 })
      }

      const supabaseUrl = required('SUPABASE_URL')
      let serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
      const namedSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
      if (!serverKey && namedSecretKeys) {
        try {
          const parsed = JSON.parse(namedSecretKeys) as Record<string, string>
          serverKey = parsed.default || Object.values(parsed)[0] || ''
        } catch { /* legacy key fallback below */ }
      }
      if (!serverKey) throw new Error('Secret serveur Supabase indisponible')

      const vapidPublic = required('VAPID_PUBLIC_KEY')
      const vapidPrivate = required('VAPID_PRIVATE_KEY')
      const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'https://sst-maker.github.io/Agenda/'

      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
      const admin = createClient(supabaseUrl, serverKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      const { data, error } = await admin.rpc('get_due_push_notifications', { p_now: new Date().toISOString() })
      if (error) throw error

      const candidates = (data || []) as Candidate[]
      let sent = 0
      let expired = 0
      const errors: string[] = []

      for (const item of candidates) {
        const subscription = {
          endpoint: item.endpoint,
          keys: { p256dh: item.p256dh, auth: item.auth }
        }
        const payload = JSON.stringify({
          title: item.title,
          body: item.body,
          url: item.url,
          tag: item.tag,
          renotify: ['change', 'overdue'].includes(item.kind),
          actions: actionsFor(item),
          data: {
            kind: item.kind,
            entityType: item.entity_type,
            entityId: item.entity_id,
            snoozeMinutes: item.snooze_minutes || 30
          }
        })

        try {
          await webpush.sendNotification(subscription, payload, { TTL: item.kind === 'summary' ? 21600 : 3600 })
          const { error: logError } = await admin.from('notification_deliveries').insert({
            subscription_id: item.subscription_id,
            user_id: item.user_id,
            delivery_key: item.delivery_key,
            kind: item.kind
          })
          if (logError && !String(logError.message || '').toLowerCase().includes('duplicate')) throw logError
          sent += 1
        } catch (sendError) {
          const status = Number((sendError as { statusCode?: number })?.statusCode || 0)
          if (status === 404 || status === 410) {
            expired += 1
            await admin.from('push_subscriptions').update({ enabled: false }).eq('id', item.subscription_id)
          } else {
            errors.push(`${item.delivery_key}: ${String((sendError as Error)?.message || sendError).slice(0, 180)}`)
          }
        }
      }

      return Response.json({ ok: true, candidates: candidates.length, sent, expired, errors: errors.slice(0, 20) })
    } catch (error) {
      console.error('agenda-notifications', error)
      return Response.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 })
    }
  }
}
