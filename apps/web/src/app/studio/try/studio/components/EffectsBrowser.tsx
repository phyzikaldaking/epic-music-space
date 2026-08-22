"use client";

import { useMemo, useState } from "react";
import { searchEffects } from "../mixing";

export function EffectsBrowser({ onAdd }: { onAdd: (effectId: string) => void }) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const effects = useMemo(() => searchEffects(query), [query]);
  return (
    <section className="effects-browser">
      <div className="mix-panel__heading"><span>EFFECTS</span><b>{effects.length} presets</b></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search effects or presets" aria-label="Search effects" />
      <div className="effects-browser__list">
        {effects.map((effect) => <article key={effect.id}>
          <button className="effect-favorite" aria-label={`${favorites.includes(effect.id) ? "Remove" : "Add"} ${effect.name} favorite`} onClick={() => setFavorites((items) => items.includes(effect.id) ? items.filter((id) => id !== effect.id) : [...items, effect.id])}>{favorites.includes(effect.id) ? "★" : "☆"}</button>
          <div><b>{effect.name}</b><small>{effect.category} · {effect.description}</small></div>
          <button className="effect-add" onClick={() => onAdd(effect.id)}>Add</button>
        </article>)}
      </div>
    </section>
  );
}
