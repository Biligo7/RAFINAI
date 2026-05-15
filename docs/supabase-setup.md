# Supabase project setup (step by step)

Auth for this app uses Supabase (email/password). Follow these steps once per environment.

## 1. Create an account and project

1. Go to [https://supabase.com](https://supabase.com) and sign up (free tier is fine).
2. Click **New project**.
3. Fill in:
   - **Name:** e.g. `rafinai`
   - **Database password:** pick something strong (you will not need this for day-to-day frontend auth; local data may still use your own Postgres as documented elsewhere).
   - **Region:** closest to you.
4. Click **Create new project** and wait roughly two minutes for provisioning.

## 2. Get your URL and anon key

When the project is ready:

1. Open **Project Settings** (gear icon in the left sidebar).
2. Under **Configuration**, click **API**.
3. Copy:
   - **Project URL** — e.g. `https://abcdefghij.supabase.co`
   - **Project API keys** → **anon** / **public** — this is your anon key (long JWT-like string).
4. Ignore **service_role** for typical frontend use (keep it secret if you ever use it server-side).

## 3. Enable email/password auth

1. In the left sidebar: **Authentication** → **Providers**.
2. Ensure **Email** is enabled (default is usually on).
3. For **local development**: **Authentication** → **Settings**:
   - Turn **Enable email confirmations** **OFF** so you can sign up and sign in immediately without checking email.

## 4. Database: profiles table and signup trigger

Supabase Auth manages `auth.users` for you. This app also expects a `public.profiles` table and a trigger to create a row on signup.

1. Open **SQL Editor** (left sidebar) → **New query**.
2. Paste and run:

```sql
-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock down the trigger function
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

3. Click **Run** to execute.

## 5. Frontend environment variables

In `frontend/.env` (copy from `frontend/.env.example` if needed), set:

```env
VITE_BACKEND_URL=http://localhost:3000
# Supabase (auth only — from supabase.com → Project Settings → API)
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

Replace `YOUR_PROJECT_ID` and `YOUR_ANON_KEY_HERE` with the real values from the Supabase dashboard.

## 6. Restart the docker compose

After saving `.env`:

```bash
docker compose up --build
```

The login page should work; you can sign up with email and password.

---

## TL;DR

Create Supabase project → copy **URL** + **anon** key from **Settings → API** → paste into `frontend/.env` → run the SQL in **SQL Editor** → disable email confirmation for dev → restart `npm run dev` → use the login page.
