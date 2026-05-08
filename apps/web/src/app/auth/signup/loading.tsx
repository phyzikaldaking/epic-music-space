export default function SignUpLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/8 studio-faceplate p-8">
        {/* Logo area */}
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-white/8" />
          <div className="mx-auto h-6 w-36 animate-pulse rounded bg-white/8" />
          <div className="mx-auto mt-2 h-4 w-52 animate-pulse rounded bg-white/6" />
        </div>
        {/* Form fields */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-white/6" />
              <div className="h-11 w-full animate-pulse rounded-lg bg-white/6" />
            </div>
          ))}
        </div>
        {/* Button */}
        <div className="h-11 w-full animate-pulse rounded-xl bg-white/8" />
        {/* Footer link */}
        <div className="mx-auto h-3 w-44 animate-pulse rounded bg-white/5" />
      </div>
    </div>
  );
}
