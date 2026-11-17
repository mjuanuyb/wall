"use client"

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import Image from "next/image"
import type { User } from "@supabase/supabase-js"

import { AccountForm } from "@/components/account-form"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { imageFileError, uploadImage } from "@/lib/images"
import {
  MAX_MESSAGE_LENGTH,
  PAGE_SIZE,
  formatTimestamp,
  mergePosts,
  type WallPost,
} from "@/lib/posts"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

type Member = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
}

type PostQueryRow = {
  id: string
  author_name: string
  message: string
  created_at: string
  image_url: string | null
  user_id: string | null
  profiles: { avatar_url: string | null } | { avatar_url: string | null }[] | null
}

function memberFromUser(
  user: User,
  profile?: { display_name?: string | null; avatar_url?: string | null } | null,
): Member {
  const metadataName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : ""

  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name || metadataName || "Member",
    avatarUrl: profile?.avatar_url ?? null,
  }
}

function toWallPost(row: PostQueryRow): WallPost {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles

  return {
    id: row.id,
    author_name: row.author_name,
    message: row.message,
    created_at: row.created_at,
    image_url: row.image_url,
    user_id: row.user_id,
    avatar_url: profile?.avatar_url ?? null,
  }
}

export function Wall() {
  const configured = isSupabaseConfigured()
  const [member, setMember] = useState<Member | null>(null)
  const [authReady, setAuthReady] = useState(!configured)
  const [message, setMessage] = useState("")
  const [posts, setPosts] = useState<WallPost[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(configured)
  const [submitting, setSubmitting] = useState(false)
  const [updatingPhoto, setUpdatingPhoto] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLElement>(null)
  const memberRef = useRef(member)
  const pageRef = useRef(page)
  const seenPostIds = useRef(new Set<string>())
  memberRef.current = member
  pageRef.current = page

  const trimmedMessage = message.trim()
  const remaining = MAX_MESSAGE_LENGTH - message.length
  const initial = member?.displayName.trim().charAt(0).toUpperCase() || "W"

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    let ignore = false

    async function loadMember(user: User | null) {
      if (!user) {
        if (!ignore) {
          setMember(null)
          setAuthReady(true)
        }
        return
      }

      const { data } = await supabase!
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      if (ignore) return
      setMember(memberFromUser(user, data))
      setAuthReady(true)
    }

    void supabase.auth.getSession().then(({ data }) => {
      void loadMember(data.session?.user ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void loadMember(session?.user ?? null)
      },
    )

    return () => {
      ignore = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function showIncomingPost(post: WallPost) {
    const isNew = !seenPostIds.current.has(post.id)
    if (isNew) {
      seenPostIds.current.add(post.id)
      setTotalCount((count) => count + 1)
    }

    if (pageRef.current !== 1) return

    setPosts((current) => mergePosts(current, [post]).slice(0, PAGE_SIZE))
  }

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    let ignore = false
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    async function loadPosts() {
      setLoading(true)
      const { data, error: loadError, count } = await supabase!
        .from("posts")
        .select(
          "id, author_name, message, created_at, image_url, user_id, profiles(avatar_url)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to)

      if (ignore) return

      if (loadError) {
        setError(loadError.message)
        setLoading(false)
        return
      }

      const nextPosts = ((data ?? []) as PostQueryRow[]).map(toWallPost)
      for (const post of nextPosts) seenPostIds.current.add(post.id)
      setPosts(nextPosts)
      setTotalCount(count ?? nextPosts.length)
      setLoading(false)
    }

    void loadPosts()

    return () => {
      ignore = true
    }
  }, [page])

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const row = payload.new as PostQueryRow
          const currentMember = memberRef.current
          const knownAvatar =
            row.user_id && row.user_id === currentMember?.id
              ? currentMember.avatarUrl
              : null

          showIncomingPost({
            ...toWallPost(row),
            avatar_url: knownAvatar,
          })

          if (row.user_id && knownAvatar === null) {
            void supabase
              .from("profiles")
              .select("avatar_url")
              .eq("id", row.user_id)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return
                setPosts((current) =>
                  current.map((post) =>
                    post.id === row.id
                      ? { ...post, avatar_url: data.avatar_url }
                      : post,
                  ),
                )
              })
          }
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED")
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  async function onShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !member) return

    if (!trimmedMessage && !imageFile) {
      setError("Write a message or add an image to share.")
      return
    }

    const supabase = createClient()
    if (!supabase) return

    setSubmitting(true)
    setError(null)

    let imageUrl: string | null = null
    if (imageFile) {
      const uploaded = await uploadImage(
        supabase,
        "post-images",
        `${member.id}/${crypto.randomUUID()}`,
        imageFile,
      )
      if (uploaded.error || !uploaded.publicUrl) {
        setSubmitting(false)
        setError(uploaded.error ?? "The image could not be added.")
        return
      }
      imageUrl = uploaded.publicUrl
    }

    const { data, error: insertError } = await supabase
      .from("posts")
      .insert({
        author_name: member.displayName,
        message: trimmedMessage,
        image_url: imageUrl,
        user_id: member.id,
      })
      .select("id, author_name, message, created_at, image_url, user_id")
      .single()

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    if (data) {
      if (page !== 1) setPage(1)
      showIncomingPost({
        ...data,
        avatar_url: member.avatarUrl,
      })
    }

    setMessage("")
    clearImage()
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  function onImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const problem = imageFileError(file)
    if (problem) {
      setError(problem)
      event.target.value = ""
      return
    }

    setError(null)
    setImageFile(file)
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
  }

  async function onPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !member) return

    const problem = imageFileError(file)
    if (problem) {
      setError(problem)
      return
    }

    const supabase = createClient()
    if (!supabase) return

    setUpdatingPhoto(true)
    setError(null)

    const uploaded = await uploadImage(
      supabase,
      "avatars",
      `${member.id}/avatar`,
      file,
    )

    if (uploaded.error || !uploaded.publicUrl) {
      setUpdatingPhoto(false)
      setError(uploaded.error ?? "The photo could not be saved.")
      return
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: uploaded.publicUrl })
      .eq("id", member.id)

    setUpdatingPhoto(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    const avatarUrl = uploaded.publicUrl
    setMember({ ...member, avatarUrl })
    setPosts((current) =>
      current.map((post) =>
        post.user_id === member.id ? { ...post, avatar_url: avatarUrl } : post,
      ),
    )
  }

  async function onSignOut() {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signOut()
    setMessage("")
    setError(null)
    clearImage()
  }

  return (
    <div className="min-h-screen bg-[#f3f1ec] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f3f1ec]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">Wall</h1>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-black/5">
            <span
              className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-zinc-300"}`}
              aria-hidden
            />
            {live ? "Live" : "Connecting"}
          </span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 sm:px-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-start md:gap-6 md:py-8">
        <aside className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 md:sticky md:top-20">
          <div className="flex items-center gap-4 md:block">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-zinc-900 text-xl font-medium text-white md:aspect-square md:h-auto md:w-full md:text-5xl">
              {member?.avatarUrl ? (
                <Image
                  src={member.avatarUrl}
                  alt=""
                  fill
                  sizes="220px"
                  className="object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0 md:hidden">
              <p className="truncate text-lg font-semibold">
                {member?.displayName ?? "Wall"}
              </p>
              <p className="truncate text-sm text-zinc-500">
                {member?.email || "Create an account to share"}
              </p>
            </div>
          </div>
          <div className="mt-4 hidden md:block">
            <p className="truncate text-lg font-semibold">
              {member?.displayName ?? "Wall"}
            </p>
            <p className="truncate text-sm text-zinc-500">
              {member?.email || "Create an account to share"}
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-zinc-50 px-3 py-2">
              <dt className="text-xs text-zinc-500">Status</dt>
              <dd className="font-medium">{live ? "Live" : "Connecting"}</dd>
            </div>
            <div className="rounded-2xl bg-zinc-50 px-3 py-2">
              <dt className="text-xs text-zinc-500">Posts</dt>
              <dd className="font-medium">{loading && totalCount === 0 ? "—" : totalCount}</dd>
            </div>
          </dl>

          {member ? (
            <div className="mt-3 flex flex-col gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800">
                {updatingPhoto ? "Saving photo…" : "Change photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={updatingPhoto}
                  onChange={(event) => void onPhotoSelected(event)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onSignOut()}
                className="h-9 w-full rounded-full border-zinc-200 bg-white"
              >
                Sign out
              </Button>
            </div>
          ) : null}
        </aside>

        <main className="flex flex-col gap-4">
          {!configured ? (
            <p className="rounded-3xl bg-white p-5 text-sm text-destructive shadow-sm ring-1 ring-black/5" role="alert">
              Add your Supabase URL and publishable key to .env.local, then
              restart the dev server.
            </p>
          ) : !authReady ? (
            <p className="rounded-3xl bg-white p-5 text-sm text-zinc-500 shadow-sm ring-1 ring-black/5">
              Loading your account…
            </p>
          ) : member ? (
            <form
              onSubmit={onShare}
              noValidate
              className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5"
            >
              <label className="block">
                <span className="sr-only">Message</span>
                <Textarea
                  name="message"
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder="What's on your mind?"
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value)
                    setError(null)
                  }}
                  disabled={submitting}
                  className="min-h-28 resize-none rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-[15px] shadow-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-950/10"
                />
              </label>
              {imagePreview ? (
                <div className="relative mt-3 overflow-hidden rounded-2xl">
                  {/* Local preview before the file is uploaded. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Selected post image"
                    className="max-h-72 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-3 right-3 rounded-full bg-white/95 px-3 py-1 text-xs font-medium shadow-sm"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <p
                    className={`text-xs ${remaining < 20 ? "text-destructive" : "text-zinc-500"}`}
                  >
                    {remaining}
                  </p>
                  <label className="cursor-pointer rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-200">
                    Add image
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      onChange={onImageSelected}
                    />
                  </label>
                </div>
                <Button
                  type="submit"
                  disabled={submitting || (trimmedMessage.length === 0 && !imageFile)}
                  className="h-9 min-w-[84px] rounded-full bg-zinc-950 px-4 text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:opacity-100"
                >
                  {submitting ? "Sharing…" : "Share"}
                </Button>
              </div>
              {error ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5">
              <AccountForm onSignedIn={() => undefined} />
            </div>
          )}

          <section
            ref={feedRef}
            aria-live="polite"
            aria-busy={loading}
            className="flex flex-col gap-3"
          >
            <h2 className="sr-only">Posts</h2>
            {loading && posts.length === 0 ? (
              <p className="rounded-3xl bg-white px-5 py-6 text-sm text-zinc-500 shadow-sm ring-1 ring-black/5">
                Loading posts…
              </p>
            ) : posts.length === 0 ? (
              <p className="rounded-3xl bg-white px-5 py-6 text-sm text-zinc-500 shadow-sm ring-1 ring-black/5">
                No posts yet. Be the first to share something.
              </p>
            ) : (
              posts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 text-sm font-medium text-white">
                        {post.avatar_url ? (
                          <Image
                            src={post.avatar_url}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : (
                          post.author_name.trim().charAt(0).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold">
                          {post.author_name}
                        </h3>
                        <time
                          dateTime={post.created_at}
                          className="text-xs text-zinc-500"
                        >
                          {formatTimestamp(post.created_at, now)}
                        </time>
                      </div>
                    </div>
                  </div>
                  {post.message ? (
                    <p className="mt-3 text-[15px] leading-6 whitespace-pre-wrap">
                      {post.message}
                    </p>
                  ) : null}
                  {post.image_url ? (
                    <Image
                      src={post.image_url}
                      alt=""
                      width={1200}
                      height={800}
                      className="mt-3 h-auto max-h-[28rem] w-full rounded-2xl object-cover"
                    />
                  ) : null}
                </article>
              ))
            )}
            {totalCount > PAGE_SIZE ? (
              <nav
                aria-label="Post pages"
                className="flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setPage((current) => Math.max(1, current - 1))
                    feedRef.current?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="h-9 rounded-full border-zinc-200 bg-white px-4"
                >
                  Previous
                </Button>
                <p className="text-sm text-zinc-500">
                  Page {page} of {pageCount}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= pageCount || loading}
                  onClick={() => {
                    setPage((current) => Math.min(pageCount, current + 1))
                    feedRef.current?.scrollIntoView({ behavior: "smooth" })
                  }}
                  className="h-9 rounded-full border-zinc-200 bg-white px-4"
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  )
}
