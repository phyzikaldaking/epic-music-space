"use client";

import { useState } from "react";

export default function ClipUploadCoach() {
  const [input, setInput] = useState<any>({ durationSeconds: 15, energyLevel: 60 });
  const [result, setResult] = useState<any>(null);

  async function analyze() {
    const res = await fetch("/api/clip/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    setResult(data);
  }

  return (
    <div className="bg-black text-white p-6 rounded-xl border border-white/10">
      <h2 className="text-2xl font-bold mb-4">AI Clip Coach</h2>

      <div className="grid gap-3 mb-4">
        <input placeholder="Title" onChange={(e) => setInput({ ...input, title: e.target.value })} className="bg-white/10 p-2 rounded" />
        <input placeholder="Hook (first 2 seconds)" onChange={(e) => setInput({ ...input, hookText: e.target.value })} className="bg-white/10 p-2 rounded" />
        <textarea placeholder="Caption" onChange={(e) => setInput({ ...input, caption: e.target.value })} className="bg-white/10 p-2 rounded" />

        <button onClick={analyze} className="bg-white text-black p-2 rounded font-bold">Analyze Clip</button>
      </div>

      {result && (
        <div>
          <p className="text-xl font-bold">🔥 Score: {result.score}</p>

          <div className="mt-3 space-y-2">
            {result.suggestions.map((s: any, i: number) => (
              <div key={i} className="bg-white/5 p-3 rounded border border-white/10">
                <p className="text-xs uppercase text-white/40">{s.type}</p>
                <p className="font-bold">{s.title}</p>
                <p className="text-sm text-white/60">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-sm text-white/40">Optimized Caption</p>
            <p className="text-white">{result.optimizedCaption}</p>
          </div>
        </div>
      )}
    </div>
  );
}
