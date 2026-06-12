## Goal

Unblock you. Stop the redirect loops, stop role checks from hiding the admin button or `/admin` page, and fix "My Progress" — without exposing other users' data.

Approach: treat every signed-in user as an admin for now (frontend + backend). Keep "My Progress" scoped per-user as it always was.

## What changes

### Frontend (gating off)
- `src/hooks/useAuth.tsx`: any signed-in user gets `userRole = 'admin'` immediately after the session loads. No more `user_roles` query, no race, no loading deadlock.
- `src/pages/AdminDashboard.tsx`: remove the "if student then redirect" / "Checking access…" branches. Only redirect to `/auth` if not signed in.
- `src/pages/AdminQuestions.tsx`: same — only the signed-in check remains.
- `src/pages/Auth.tsx`: after sign-in, just navigate to the requested redirect (default `/`). Drop the extra `user_roles` lookup.
- `src/pages/ModulePicker.tsx`: always show the "Admin Dashboard" button for signed-in users.

### Backend (RLS opened to all signed-in users, except progress)
A single migration that rewrites policies so:
- `questions`: any signed-in user can SELECT / INSERT / UPDATE / DELETE (lets you upload + edit question and mark-scheme images).
- `storage.objects` on the `exam-images` bucket: any signed-in user can read/write/delete.
- `profiles`: a signed-in user can read/update their own row (unchanged in spirit).
- `user_roles`: readable by signed-in users (harmless now that the frontend ignores it). No writes from the client.
- `student_attempts`: **unchanged** — each user still only sees and writes their own rows. This is what restores "My Progress" for you (the loop and role confusion were making the page error out / show nothing).

No tables are opened to anonymous visitors. The published app still requires sign-in for everything that matters.

## Why "My Progress" came back empty

Your account is signed in, but the previous changes left the role resolver in a state where `userRole` never settled to `'admin'`, which made `/admin` bounce and `/progress` render its "loading…" branch indefinitely. The attempts row in the database is fine — the migration below doesn't touch your data, and once the frontend stops gating, your history will reappear.

## How we put real admin gating back later

When you're ready, we re-introduce role checks in two small steps: (1) restore the `private.has_role` based RLS on `questions`/storage, (2) put the role check back in `useAuth` and the admin pages. Your `user_roles` row stays in place the whole time, so nothing needs to be re-seeded.

## Technical details

- Migration drops and recreates the existing policies on `public.questions`, `public.user_roles`, `public.profiles`, and the `exam-images` policies on `storage.objects`. Each `CREATE POLICY` uses `TO authenticated` with `USING (true)` / `WITH CHECK (true)` for the opened tables; `student_attempts` keeps `auth.uid() = user_id`. GRANTs to `authenticated` and `service_role` are reasserted on every touched public table; no GRANTs to `anon`.
- `useAuth` keeps the `useSyncExternalStore` shape but the role resolver becomes synchronous: `userRole = session?.user ? 'admin' : null`, `loading` flips to `false` as soon as `getSession()` resolves.
- No edits to `src/integrations/supabase/client.ts` or generated types.

After you approve, I run the migration first, then make the frontend edits, then ask you to click **Update** in the Publish dialog so the live site picks up the changes.
