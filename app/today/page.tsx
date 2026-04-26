import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { Button } from "@/components/ui/button";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>
      <p className="text-sm text-muted-foreground">
        Signed in as {user?.email}.
      </p>
      <p className="text-sm">Dashboard arrives in Phase 2.</p>
    </main>
  );
}
