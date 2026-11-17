import type { Post } from "@/lib/database.types"

export const MAX_MESSAGE_LENGTH = 280
export const MAX_AUTHOR_LENGTH = 40
export const MIN_PASSWORD_LENGTH = 6
export const PAGE_SIZE = 50

export type WallPost = Pick<
  Post,
  "id" | "author_name" | "message" | "created_at" | "image_url"
> & {
  user_id: string | null
  avatar_url: string | null
}

export function mergePosts(current: WallPost[], incoming: WallPost[]) {
  const byId = new Map<string, WallPost>()

  for (const post of [...incoming, ...current]) {
    byId.set(post.id, post)
  }

  return [...byId.values()].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )
}

export function formatTimestamp(iso: string, now: number) {
  const then = Date.parse(iso)
  const seconds = Math.max(0, Math.round((now - then) / 1000))

  if (seconds < 45) return "now"

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(then)
}
