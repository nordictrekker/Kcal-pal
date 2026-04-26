import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  return <LoginFormWrapper searchParams={searchParams} />;
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm error={params.error} sent={params.sent === "1"} />
    </main>
  );
}
