"use client";

import { useEffect, useState } from "react";

export default function OwnershipDashboard() {
  const [licenses, setLicenses] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/ownership")
      .then((res) => res.json())
      .then((data) => setLicenses(data.licenses || []));
  }, []);

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Owned Beats</h1>

      {licenses.map((license) => (
        <div key={license.id} className="mb-4 p-4 bg-white/5 rounded">
          <h2>{license.song.title}</h2>
          <p className="text-sm text-white/60">{license.song.artist}</p>

          <p className="mt-2">License #{license.tokenNumber}</p>
          <p>Paid: ${license.price}</p>

          <div className="mt-3 flex gap-2">
            <button className="bg-green-600 px-3 py-1 rounded">Resell</button>
            <button className="bg-purple-600 px-3 py-1 rounded">Auction</button>
          </div>
        </div>
      ))}
    </div>
  );
}
