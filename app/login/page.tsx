import { LoginForm } from "./login-form";

type SearchParams = Promise<{
  error?: string;
  sent?: string;
  email?: string;
}>;

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <LoginFormWrapper searchParams={searchParams} />;
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm
        error={params.error}
        sent={params.sent === "1"}
        email={params.email}
      />
    </main>
  );
}
