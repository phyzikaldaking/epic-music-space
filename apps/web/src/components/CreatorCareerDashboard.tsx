"use client";

import {
  demoCareerStats,
  calculateCreatorXp,
  getCreatorLevel,
  getNextCreatorLevel,
  getLevelProgress,
  buildCareerMilestones,
  buildCareerQuests,
  calculateIncomeTarget,
  generateCareerAdvice,
} from "@/lib/creatorCareer";

export default function CreatorCareerDashboard() {
  const xp = calculateCreatorXp(demoCareerStats);
  const level = getCreatorLevel(xp);
  const nextLevel = getNextCreatorLevel(xp);
  const progress = getLevelProgress(xp);
  const milestones = buildCareerMilestones(demoCareerStats);
  const quests = buildCareerQuests(demoCareerStats);
  const income = calculateIncomeTarget(demoCareerStats);
  const advice = generateCareerAdvice(demoCareerStats);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-black mb-6">Creator Career Mode</h1>

      <div className="mb-6">
        <p className="text-xl">Level {level.level} — {level.title}</p>
        <p>XP: {xp}</p>
        <div className="w-full bg-white/10 h-2 rounded mt-2">
          <div className="bg-white h-2 rounded" style={{ width: `${progress}%` }} />
        </div>
        {nextLevel && <p className="text-sm mt-2">Next: {nextLevel.title}</p>}
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">Income Target</h2>
        <p>${income.current} / ${income.target}</p>
        <div className="w-full bg-white/10 h-2 rounded mt-2">
          <div className="bg-green-400 h-2 rounded" style={{ width: `${income.progress}%` }} />
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">Milestones</h2>
        {milestones.map((m) => (
          <div key={m.id} className="bg-white/5 p-3 rounded mb-2">
            <p className="font-bold">{m.title}</p>
            <p>{m.progress} / {m.target}</p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">Quests</h2>
        {quests.map((q) => (
          <div key={q.id} className="bg-white/5 p-3 rounded mb-2">
            <p className="font-bold">{q.title}</p>
            <p>{q.progress} / {q.target}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-2xl font-bold">AI Career Advice</h2>
        {advice.map((a, i) => (
          <p key={i} className="bg-white/5 p-3 rounded mb-2">{a}</p>
        ))}
      </div>
    </div>
  );
}
