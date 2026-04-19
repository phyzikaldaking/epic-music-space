import Link from "next/link";

export const metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-ems-black flex items-center justify-center px-6 city-grid-bg">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-ems-purple/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-sora font-bold text-3xl text-ems-gold neon-text-gold">
            EMS
          </Link>
          <p className="text-gray-400 mt-2 text-sm">Welcome back to the city</p>
        </div>

        <div className="glass-card p-8 border border-ems-border">
          <h1 className="font-sora text-2xl font-bold text-ems-text mb-6">Sign In</h1>

          <form className="space-y-4" action="/api/auth/login" method="POST">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full bg-ems-black border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 focus:ring-1 focus:ring-ems-gold/30 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-400">
                  Password
                </label>
                <Link href="/auth/forgot-password" className="text-xs text-ems-gold hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full bg-ems-black border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 focus:ring-1 focus:ring-ems-gold/30 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-ems-gold text-black font-semibold py-3 rounded-xl hover:bg-yellow-400 transition-colors mt-2"
            >
              Enter the City
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            Don&apos;t have a studio?{" "}
            <Link href="/auth/register" className="text-ems-gold hover:underline">
              Join free
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
