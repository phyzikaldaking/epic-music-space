import Link from "next/link";

export const metadata = { title: "Create Account" };

const plans = [
  { value: "STARTER", label: "Starter — $9/mo", desc: "Underground district. Start building." },
  { value: "PRO", label: "Pro — $29/mo", desc: "Producer Alley. Billboard access." },
  { value: "PRIME", label: "Prime — $99+/mo", desc: "Downtown Prime. Full visibility." },
];

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-ems-black flex items-center justify-center px-6 py-12 city-grid-bg">
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-ems-gold/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-sora font-bold text-3xl text-ems-gold neon-text-gold">
            EMS
          </Link>
          <p className="text-gray-400 mt-2 text-sm">Claim your studio in the city</p>
        </div>

        <div className="glass-card p-8 border border-ems-border">
          <h1 className="font-sora text-2xl font-bold text-ems-text mb-6">Create Your Studio</h1>

          <form className="space-y-4" action="/api/auth/register" method="POST">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-400 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="w-full bg-ems-black border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 focus:ring-1 focus:ring-ems-gold/30 transition-colors"
                  placeholder="yourname"
                />
              </div>
              <div>
                <label htmlFor="studio-name" className="block text-sm font-medium text-gray-400 mb-2">
                  Studio Name
                </label>
                <input
                  id="studio-name"
                  name="studioName"
                  type="text"
                  required
                  className="w-full bg-ems-black border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 focus:ring-1 focus:ring-ems-gold/30 transition-colors"
                  placeholder="My Studio"
                />
              </div>
            </div>

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
              <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full bg-ems-black border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 focus:ring-1 focus:ring-ems-gold/30 transition-colors"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Choose Your Plan</label>
              <div className="space-y-2">
                {plans.map((plan, i) => (
                  <label
                    key={plan.value}
                    className="flex items-start gap-3 p-3 rounded-lg border border-ems-border hover:border-ems-gold/30 cursor-pointer transition-colors"
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.value}
                      defaultChecked={i === 0}
                      className="mt-1 accent-ems-gold"
                    />
                    <div>
                      <div className="text-sm font-medium text-ems-text">{plan.label}</div>
                      <div className="text-xs text-gray-500">{plan.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-ems-gold text-black font-semibold py-3 rounded-xl hover:bg-yellow-400 transition-colors mt-2"
            >
              Claim My Studio →
            </button>

            <p className="text-center text-gray-600 text-xs">
              By joining you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>

          <p className="text-center text-gray-500 text-sm mt-4">
            Already have a studio?{" "}
            <Link href="/auth/login" className="text-ems-gold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
