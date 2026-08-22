import { describe, expect, it } from "vitest";
import { createProjectHistory, executeProjectCommand, redoProjectCommand, undoProjectCommand } from "@/app/studio/try/studio/projectHistory";

type State = { bpm: number; mixer: { gain: number }; routing: string[]; automation: number[]; compTake: string; sections: string[] };
const initial: State = { bpm: 92, mixer: { gain: 0 }, routing: ["master"], automation: [], compTake: "take-1", sections: [] };

describe("Studio unified project history", () => {
  it("undoes and redoes commands across all project domains", () => {
    let history = createProjectHistory(initial, 4);
    history = executeProjectCommand(history, { label: "Mixer gain", apply: (state) => ({ ...state, mixer: { gain: 3 } }) });
    history = executeProjectCommand(history, { label: "Routing", apply: (state) => ({ ...state, routing: ["bus-a"] }) });
    history = executeProjectCommand(history, { label: "Automation and comp", apply: (state) => ({ ...state, automation: [1, 2], compTake: "take-2", sections: ["chorus"] }) });
    history = undoProjectCommand(history);
    expect(history.present).toMatchObject({ routing: ["bus-a"], automation: [], compTake: "take-1", sections: [] });
    history = redoProjectCommand(history);
    expect(history.present).toMatchObject({ automation: [1, 2], compTake: "take-2", sections: ["chorus"] });
  });

  it("bounds history and clears redo after a divergent command", () => {
    let history = createProjectHistory(initial, 2);
    history = executeProjectCommand(history, { label: "1", apply: (state) => ({ ...state, bpm: 93 }) });
    history = executeProjectCommand(history, { label: "2", apply: (state) => ({ ...state, bpm: 94 }) });
    history = executeProjectCommand(history, { label: "3", apply: (state) => ({ ...state, bpm: 95 }) });
    expect(history.past).toHaveLength(2);
    history = undoProjectCommand(history);
    history = executeProjectCommand(history, { label: "branch", apply: (state) => ({ ...state, bpm: 100 }) });
    expect(history.future).toEqual([]);
    expect(history.present.bpm).toBe(100);
  });
});
