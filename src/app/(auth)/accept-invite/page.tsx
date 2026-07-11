import { AcceptInviteForm } from "./accept-invite-form";

export const dynamic = "force-dynamic";

/**
 * PUBLIC page (allow-listed in the proxy): a student clicks the "set your
 * password" link from their invite email while signed out. The token in the
 * URL is the credential — validated server-side by acceptInvite.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-2xl">Welcome to Sparmanik Farm</h1>
        <p className="text-sm text-muted-foreground">
          Set your password to start your courses.
          <br />
          <span className="italic">Buat kata sandi untuk memulai kursus Anda.</span>
        </p>
      </div>
      <AcceptInviteForm token={token ?? ""} />
    </div>
  );
}
