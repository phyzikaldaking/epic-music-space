import Link from "next/link";

export const metadata = { title: "Artist Dashboard" };

const stats = [
  { label: "Studio Visits", value: "2,847", change: "+12%", up: true },
  { label: "Billboard Clicks", value: "1,203", change: "+8%", up: true },
  { label: "Total Revenue", value: "$1,840", change: "+23%", up: true },
  { label: "Products Sold", value: "47", change: "-2%", up: false },
];

const recentTransactions = [
  { item: "808 Trap Kit Vol.2", buyer: "djkrown", amount: "$35.00", date: "Today" },
  { item: "Billboard — Downtown", item2: "Ad Placement", buyer: "Self", amount: "$99.00", date: "Yesterday" },
  { item: "Mixing Service", buyer: "luna_beats", amount: "$150.00", date: "Apr 16" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-ems-black">
      {/* Sidebar layout */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 min-h-screen border-r border-ems-border p-6 gap-2">
          <Link href="/" className="font-sora font-bold text-xl text-ems-gold neon-text-gold mb-6">
            EMS
          </Link>
          {[
            { href: "/dashboard", label: "Dashboard", icon: "🏠" },
            { href: "/studio/me", label: "My Studio", icon: "🎵" },
            { href: "/billboards", label: "Billboards", icon: "📣" },
            { href: "/marketplace", label: "Marketplace", icon: "🛒" },
            { href: "/city", label: "City Map", icon: "🌆" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-ems-text hover:bg-ems-surface transition-colors text-sm"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="flex-1" />
          <div className="glass-card p-4 border border-ems-gold/20">
            <div className="text-xs font-semibold text-ems-gold mb-1">STARTER PLAN</div>
            <p className="text-xs text-gray-500 mb-3">Upgrade to access billboards and more.</p>
            <Link
              href="/billing"
              className="block w-full text-center text-xs bg-ems-gold text-black font-semibold py-2 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Upgrade →
            </Link>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-sora text-2xl font-bold text-ems-text">Dashboard</h1>
              <p className="text-gray-500 text-sm mt-1">Welcome back, artist</p>
            </div>
            <Link
              href="/studio/me"
              className="text-sm border border-ems-gold/30 text-ems-gold px-4 py-2 rounded-lg hover:bg-ems-gold/10 transition-colors"
            >
              View Studio →
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
              <div key={s.label} className="glass-card p-5 border border-ems-border">
                <div className="text-gray-500 text-xs mb-2">{s.label}</div>
                <div className="font-sora text-2xl font-bold text-ems-text mb-1">{s.value}</div>
                <div className={`text-xs font-medium ${s.up ? "text-green-400" : "text-red-400"}`}>
                  {s.change} this week
                </div>
              </div>
            ))}
          </div>

          {/* Recent transactions */}
          <div className="glass-card border border-ems-border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sora font-bold text-ems-text">Recent Transactions</h2>
              <Link href="/transactions" className="text-xs text-ems-gold hover:underline">View all</Link>
            </div>
            <div className="space-y-3">
              {recentTransactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-ems-border/50 last:border-0">
                  <div>
                    <div className="text-sm text-ems-text font-medium">{tx.item}</div>
                    <div className="text-xs text-gray-500">{tx.buyer} · {tx.date}</div>
                  </div>
                  <div className="text-sm font-semibold text-green-400">{tx.amount}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { href: "/marketplace/new", label: "Upload a Beat", icon: "🎵", desc: "Add to your store" },
              { href: "/billboards", label: "Buy Billboard", icon: "📣", desc: "Get more visibility" },
              { href: "/events/new", label: "Host an Event", icon: "🎫", desc: "Sell tickets" },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="glass-card p-5 border border-ems-border hover:border-ems-gold/30 transition-colors flex items-center gap-4"
              >
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <div className="font-semibold text-sm text-ems-text">{a.label}</div>
                  <div className="text-xs text-gray-500">{a.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
