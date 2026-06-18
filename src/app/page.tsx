import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();
  const status = error ? `error: ${error.message}` : "connected";

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm font-mono text-zinc-500">
        Supabase:{" "}
        <span className={error ? "text-red-500" : "text-green-600"}>
          {status}
        </span>
      </p>
    </main>
  );
}
