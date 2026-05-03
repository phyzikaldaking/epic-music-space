"use client";

import { useEffect, useState } from "react";

export default function CreatorWallet({ userId }: { userId: string }) {
  const [wallet, setWallet] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/wallet?userId=${userId}`)
      .then((res) => res.json())
      .then(setWallet);
  }, [userId]);

  async function requestPayout() {
    const res = await fetch("/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    alert(JSON.stringify(data));
  }

  if (!wallet) return <div>Loading wallet...</div>;

  return (
    <div className="bg-black text-white p-6 rounded-xl border border-white/10">
      <h2 className="text-2xl font-bold mb-4">Creator Wallet</h2>

      <div className="grid gap-2 mb-4">
        <p>💰 Available: ${wallet.availableBalance}</p>
        <p>⏳ Pending: ${wallet.pendingBalance}</p>
        <p>🏦 Paid Out: ${wallet.paidOutTotal}</p>
        <p>📈 Total Earned: ${wallet.grossEarnings}</p>
      </div>

      <button
        onClick={requestPayout}
        disabled={!wallet.payoutReady}
        className="bg-white text-black px-4 py-2 rounded font-bold disabled:opacity-50"
      >
        Request Payout
      </button>

      {!wallet.payoutReady && (
        <p className="text-sm text-white/50 mt-2">
          Minimum payout: ${wallet.minimumPayout}
        </p>
      )}
    </div>
  );
}
