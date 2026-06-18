import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();
  const status = error ? `error: ${error.message}` : "connected";

  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
        CRM Artisan &mdash; Coming Soon
      </h1>
    </main>
  );
}
