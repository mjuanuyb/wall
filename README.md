# Wall

A live message wall. Create an account with your name, email, and password, write a short post (280 characters), then press Share. New posts appear at the top without reloading the page.

## Stack

- Next.js 15 and React 19
- Tailwind CSS and shadcn/ui
- Supabase Postgres, with realtime inserts on the `posts` table

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with your project URL and publishable key, then open [http://localhost:3000](http://localhost:3000).

## Deploy

The app is a standard Next.js build. On the host, set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Apply every file in `supabase/migrations` to the Supabase project before the first deploy. Those files create `posts`, `profiles`, image storage, and the rule that only a signed-in account can share.

On Vercel, import this GitHub repository, add the two variables for Production, and deploy. Vercel runs `npm run build` and `next start` is not required there.

The `posts` table stores `id`, `author_name`, `message`, `created_at`, and an optional image. Accounts live in Supabase Auth, with each person's name and photo in `profiles`.
