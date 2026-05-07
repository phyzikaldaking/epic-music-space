// Stable skeleton that mirrors the real /auth/signin layout (glass card,
// max-w-md, same spacing). Avoiding a layout flash matters here because
// any visual shift on the sign-in screen makes users distrust the page.
export default function SignInLoading() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl p-8">
          <div className="mb-2 h-7 w-24 animate-pulse rounded bg-white/10" />
          <div className="mb-6 h-4 w-56 animate-pulse rounded bg-white/6" />
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 h-3 w-12 animate-pulse rounded bg-white/6" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-white/6" />
            </div>
            <div>
              <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-white/6" />
              <div className="h-11 w-full animate-pulse rounded-xl bg-white/6" />
            </div>
            <div className="h-12 w-full animate-pulse rounded-xl bg-white/8" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
