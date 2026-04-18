import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-y-auto relative z-10">{children}</main>
        <PlayerBar />
      </div>
    </div>
  );
}
