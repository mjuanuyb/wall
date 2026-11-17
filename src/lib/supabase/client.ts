import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

let browserClient: SupabaseClient<Database> | undefined

function supabaseEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  return process.env[name]?.trim() || ""
}

export function isSupabaseConfigured() {
  return Boolean(
    supabaseEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      supabaseEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  )
}

export function createClient() {
  const url = supabaseEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = supabaseEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

  if (!url || !key) {
    return null
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key)
  }

  return browserClient
}
