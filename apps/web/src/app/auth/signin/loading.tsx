export default function SignInLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/8 bg-[#141414] p-8">
        {/* Logo area */}
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-white/8" />
          <div className="mx-auto h-6 w-32 animate-pulse rounded bg-white/8" />
          <div className="mx-auto mt-2 h-4 w-48 animate-pulse rounded bg-white/6" />
        </div>
        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-white/6" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-white/6" />
          </div>
          <div>
            <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-white/6" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-white/6" />
          </div>
        </div>
        {/* Button */}
        <div className="h-11 w-full animate-pulse rounded-xl bg-white/8" />
        {/* Footer link */}
        <div className="mx-auto h-3 w-40 animate-pulse rounded bg-white/5" />
      </div>
    </div>
  );
}
