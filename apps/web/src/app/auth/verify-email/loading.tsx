export default function VerifyEmailLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/8 studio-faceplate p-8 text-center">
        <div className="mx-auto h-14 w-14 animate-pulse rounded-full bg-white/8" />
        <div className="mx-auto h-6 w-40 animate-pulse rounded bg-white/8" />
        <div className="mx-auto h-4 w-64 animate-pulse rounded bg-white/6" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-white/6" />
      </div>
    </div>
  );
}
