// ────────────────────────────────────────────────────────────────────────────
// Supabase client — cloud DB + file storage for the Hermes workspace.
// Graceful fallback: if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not
// set (or the project is inactive), the app keeps working and logs
// 'supabase offline'. Agent-side writes work via composio from other agents.
// ────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

let client: SupabaseClient | null = null
let offlineLogged = false

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 16 && SUPABASE_ANON_KEY.length > 40
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    if (!offlineLogged) {
      console.info('[supabase] offline — VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not configured')
      offlineLogged = true
    }
    return null
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    console.info('[supabase] connected →', SUPABASE_URL)
  }
  return client
}

export type AgentEvent = {
  worker_id: string
  event: string
  tool?: string | null
  ts: number
}

export type AgentFile = {
  name: string
  path: string
  drive_id?: string | null
  size: number
  ts: number
}

/** Insert an agent event (worker → what happened). Fire-and-forget; never throws. */
export async function recordAgentEvent(
  workerId: string,
  event: string,
  tool?: string | null,
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  try {
    const { error } = await sb.from('agent_events').insert({
      worker_id: workerId,
      event,
      tool: tool ?? null,
      ts: Date.now(),
    })
    if (error) {
      console.warn('[supabase] agent_events insert failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[supabase] agent_events insert threw:', err)
    return false
  }
}

/** Register an agent-generated file. Fire-and-forget; never throws. */
export async function recordAgentFile(file: AgentFile): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  try {
    const { error } = await sb.from('agent_files').insert(file)
    if (error) {
      console.warn('[supabase] agent_files insert failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[supabase] agent_files insert threw:', err)
    return false
  }
}

export async function listAgentEvents(limit = 50): Promise<Array<AgentEvent>> {
  const sb = getSupabase()
  if (!sb) return []
  try {
    const { data, error } = await sb
      .from('agent_events')
      .select('*')
      .order('ts', { ascending: false })
      .limit(limit)
    if (error) {
      console.warn('[supabase] agent_events select failed:', error.message)
      return []
    }
    return (data ?? []) as Array<AgentEvent>
  } catch {
    return []
  }
}

export async function listAgentFiles(limit = 50): Promise<Array<AgentFile>> {
  const sb = getSupabase()
  if (!sb) return []
  try {
    const { data, error } = await sb
      .from('agent_files')
      .select('*')
      .order('ts', { ascending: false })
      .limit(limit)
    if (error) {
      console.warn('[supabase] agent_files select failed:', error.message)
      return []
    }
    return (data ?? []) as Array<AgentFile>
  } catch {
    return []
  }
}
