import { Graph, SpecNode, Relation, RelationType, QueryHit, RELATION_TYPES } from '../types';

export function getNode(graph: Graph, id: string): SpecNode | undefined {
  return graph.nodes[id];
}

export function hasNode(graph: Graph, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(graph.nodes, id);
}

export function addNode(graph: Graph, node: SpecNode): Graph {
  if (hasNode(graph, node.id)) {
    throw new Error(`Node already exists: ${node.id}`);
  }
  graph.nodes[node.id] = node;
  return graph;
}

export function upsertNode(graph: Graph, node: SpecNode): Graph {
  graph.nodes[node.id] = node;
  return graph;
}

export function addRelation(graph: Graph, fromId: string, toId: string, type: RelationType): Graph {
  const from = getNode(graph, fromId);
  if (!from) throw new Error(`Unknown source node: ${fromId}`);
  if (!hasNode(graph, toId)) throw new Error(`Unknown target node: ${toId}`);
  if (!RELATION_TYPES.includes(type)) throw new Error(`Unknown relation type: ${type}`);
  const exists = from.relations.some((r) => r.type === type && r.target === toId);
  if (!exists) {
    from.relations.push({ type, target: toId });
  }
  return graph;
}

export function outgoing(graph: Graph, id: string): Relation[] {
  const node = getNode(graph, id);
  return node ? node.relations : [];
}

export function incoming(graph: Graph, id: string): Array<{ from: string; type: RelationType }> {
  const result: Array<{ from: string; type: RelationType }> = [];
  for (const node of Object.values(graph.nodes)) {
    for (const rel of node.relations) {
      if (rel.target === id) {
        result.push({ from: node.id, type: rel.type });
      }
    }
  }
  return result;
}

export function listNodes(
  graph: Graph,
  filter: { type?: string; domain?: string } = {}
): SpecNode[] {
  return Object.values(graph.nodes).filter((n) => {
    if (filter.type && n.type !== filter.type) return false;
    if (filter.domain && n.domain.toLowerCase() !== filter.domain.toLowerCase()) return false;
    return true;
  });
}

const TAG_HIT = 3;
const TITLE_HIT = 2;
const DESCRIPTION_HIT = 1;

export function search(graph: Graph, query: string): QueryHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: QueryHit[] = [];

  for (const node of Object.values(graph.nodes)) {
    let score = 0;
    const matched: string[] = [];
    const title = node.title.toLowerCase();
    const description = node.description.toLowerCase();
    const tags = node.tags.map((t) => t.toLowerCase());

    for (const token of tokens) {
      if (tags.some((t) => t.includes(token))) {
        score += TAG_HIT;
        matched.push(`tag:${token}`);
      }
      if (title.includes(token)) {
        score += TITLE_HIT;
        matched.push(`title:${token}`);
      }
      if (description.includes(token)) {
        score += DESCRIPTION_HIT;
        matched.push(`description:${token}`);
      }
      if (node.id.toLowerCase().includes(token)) {
        score += TITLE_HIT;
        matched.push(`id:${token}`);
      }
    }

    if (score > 0) {
      hits.push({ id: node.id, score, matched_on: matched });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits;
}
