import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function imageFileError(file: File) {
  if (!IMAGE_TYPES.has(file.type)) {
    return "Only JPEG, PNG, WebP, and GIF images can be added."
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Images must be 5 MB or smaller."
  }

  return null
}

function extensionFor(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    default:
      return null
  }
}

export async function uploadImage(
  supabase: SupabaseClient<Database>,
  bucket: "avatars" | "post-images",
  path: string,
  file: File,
) {
  const extension = extensionFor(file.type)
  if (!extension) {
    return { publicUrl: null, error: "Only JPEG, PNG, WebP, and GIF images can be added." }
  }

  const objectPath = `${path}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
    contentType: file.type,
    upsert: bucket === "avatars",
  })

  if (error) {
    return { publicUrl: null, error: error.message }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  const version = bucket === "avatars" ? `?v=${Date.now()}` : ""
  return { publicUrl: `${data.publicUrl}${version}`, error: null }
}
