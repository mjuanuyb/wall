"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_AUTHOR_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/posts"
import { createClient } from "@/lib/supabase/client"

const fieldClassName =
  "h-11 rounded-2xl border-0 bg-zinc-50 px-4 shadow-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-950/10"

export function AccountForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"create" | "sign-in">("create")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = createClient()
    if (!supabase || submitting) return

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (mode === "create" && (trimmedName.length < 1 || trimmedName.length > MAX_AUTHOR_LENGTH)) {
      setError("Enter a name of up to 40 characters.")
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setSubmitting(true)
    setError(null)

    if (mode === "create") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { display_name: trimmedName } },
      })

      if (signUpError) {
        setSubmitting(false)
        setError(signUpError.message)
        return
      }

      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })

        if (signInError) {
          setSubmitting(false)
          setError(signInError.message)
          return
        }
      }

      const userId = data.user?.id ?? (await supabase.auth.getUser()).data.user?.id
      if (userId) {
        await supabase.from("profiles").upsert({
          id: userId,
          display_name: trimmedName,
        })
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (signInError) {
        setSubmitting(false)
        setError(signInError.message)
        return
      }
    }

    setPassword("")
    setSubmitting(false)
    onSignedIn()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {mode === "create" ? "Create an account" : "Sign in"}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {mode === "create"
            ? "Anyone with an account can share on the wall."
            : "Welcome back. Sign in to share."}
        </p>
      </div>

      {mode === "create" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <Input
            name="name"
            autoComplete="nickname"
            maxLength={MAX_AUTHOR_LENGTH}
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={fieldClassName}
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className={fieldClassName}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <Input
          name="password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          placeholder={`${MIN_PASSWORD_LENGTH} characters or more`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={fieldClassName}
        />
      </label>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4 pt-1">
        <button
          type="button"
          className="text-left text-sm text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create")
            setError(null)
          }}
        >
          {mode === "create" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        <Button
          type="submit"
          disabled={submitting}
          className="h-10 min-w-[132px] rounded-full bg-zinc-950 px-4 text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:opacity-100"
        >
          {submitting
            ? "Please wait…"
            : mode === "create"
              ? "Create account"
              : "Sign in"}
        </Button>
      </div>
    </form>
  )
}
