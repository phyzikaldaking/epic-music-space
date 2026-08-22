import { describe, expect, it } from "vitest";
import { addRoutingConnection, validateRoutingGraph, type RoutingGraph } from "@/app/studio/try/studio/routingGraph";

const graph: RoutingGraph = { nodes: [{ id: "track", kind: "track" }, { id: "group", kind: "group" }, { id: "bus", kind: "bus" }, { id: "return", kind: "return" }, { id: "master", kind: "master" }], connections: [{ from: "track", to: "group", mode: "output" }, { from: "group", to: "master", mode: "output" }, { from: "track", to: "bus", mode: "send-pre" }, { from: "bus", to: "return", mode: "output" }, { from: "return", to: "master", mode: "output" }] };

describe("Studio routing graph", () => {
  it("accepts tracks, groups, buses, pre/post sends, returns, and master", () => {
    expect(validateRoutingGraph(graph)).toEqual({ valid: true, errors: [] });
    expect(addRoutingConnection(graph, { from: "group", to: "bus", mode: "send-post" }).connections).toHaveLength(6);
  });
  it("rejects cycles and invalid master outputs", () => {
    expect(addRoutingConnection(graph, { from: "return", to: "track", mode: "output" })).toBe(graph);
    expect(validateRoutingGraph({ ...graph, connections: [...graph.connections, { from: "master", to: "track", mode: "output" }] }).valid).toBe(false);
  });
});
