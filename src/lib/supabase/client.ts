import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

let browserClient: SupabaseClient<Database> | undefined

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ""
}

function supabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ""
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseKey())
}

export function createClient() {
  const url = supabaseUrl()
  const key = supabaseKey()

  if (!url || !key) {
    return null
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key)
  }

  return browserClient
}
