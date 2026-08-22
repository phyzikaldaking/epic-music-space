export type RoutingNode = { id: string; kind: "track" | "group" | "bus" | "return" | "master" };
export type RoutingConnection = { from: string; to: string; mode: "output" | "send-pre" | "send-post" };
export type RoutingGraph = { nodes: RoutingNode[]; connections: RoutingConnection[] };

export function validateRoutingGraph(graph: RoutingGraph) {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  const masterIds = new Set(graph.nodes.filter((node) => node.kind === "master").map((node) => node.id));
  for (const edge of graph.connections) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`Unknown route ${edge.from} → ${edge.to}`);
    if (masterIds.has(edge.from)) errors.push("Master cannot route to another node.");
    if (edge.from === edge.to) errors.push(`Self-cycle at ${edge.from}`);
  }
  const adjacency = new Map<string, string[]>();
  graph.connections.forEach((edge) => adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]));
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id); active.add(id);
    const cyclic = (adjacency.get(id) ?? []).some(visit);
    active.delete(id);
    return cyclic;
  }
  if (graph.nodes.some((node) => visit(node.id))) errors.push("Routing cycle detected.");
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function addRoutingConnection(graph: RoutingGraph, connection: RoutingConnection) {
  const next = { ...graph, connections: [...graph.connections, connection] };
  return validateRoutingGraph(next).valid ? next : graph;
}
