import { Graph, SpecNode } from '../types';
import { incoming, listNodes } from '../graph/ops';
import { detectDomain } from './intentToGraph';

/**
 * Prompt templates emitted by `pv generate --prompt`, `pv bootstrap --prompt`,
 * `pv enrich --prompt`. PV deliberately does not call an LLM API itself —
 * instead, these commands build a structured prompt that the user pastes
 * into their coding agent (Claude Code, Codex, ...). The agent already has
 * Read/Edit tools, repo context, and a billing relationship with its
 * provider; PV adds the schema and the conventions, and gets out of the
 * way.
 */

const SCHEMA_REMINDER = `## Schema reminder
- Each node: { id, type, domain, title, description, tags, relations, createdAt }
- type: requirement | api | workflow | entity
- relations: depends_on | implements | affects | uses
- ID format: <TYPE>-<DOMAIN>-<SLUG>, e.g. \`API-AUTH-LOGIN\`, \`REQ-AUTH-001\`

Edge directions when an agent computes impact-of(N):
- depends_on / implements / uses → reverse-traversed
- affects → forward-traversed`;

const VERIFY_BLOCK = `## Verification
1. Run \`pv validate\` — must show 0 errors.
2. Run \`pv export-all\` to refresh \`spec/\`.
3. Reply with the IDs you added/changed and a one-line summary each.`;

function formatNodeBrief(n: SpecNode): string {
  return `- \`${n.id}\` (${n.type}, ${n.domain}) — ${n.title}`;
}

export function buildGeneratePrompt(intent: string, graph: Graph): string {
  const domain = detectDomain(intent);
  const peers = listNodes(graph, { domain }).slice(0, 12);
  const peerList = peers.length
    ? peers.map(formatNodeBrief).join('\n')
    : `(no existing nodes in domain \`${domain}\` — this may be a brand-new area)`;

  return `# Polaris Vibe Spec — node creation request

## User intent
> ${intent}

${SCHEMA_REMINDER}

## Existing nodes you might link to (domain: ${domain})
${peerList}

## Task
1. Decide whether this intent is one node or several (e.g. a new REQ + a new API).
2. Mint stable IDs following the convention. Use the next available counter for REQs (\`REQ-${domain}-NNN\`); use slugs for APIs/Workflows/Entities.
3. Write descriptions that capture *why*, not just *what*. The code already shows *what*.
4. Wire relations: e.g., a new API \`implements\` the REQ, \`uses\` an existing entity, etc. Don't auto-add \`depends_on\` — only when truly load-bearing.
5. Edit \`.polaris/graph.json\` directly to add the node(s).

${VERIFY_BLOCK}
`;
}

export function buildBootstrapPrompt(scanRoot: string, draftGraphPath: string, draftCodemapPath: string): string {
  return `# Polaris Vibe Spec — semantic bootstrap

## Context
The user wants to bootstrap an existing codebase into a PV-aware repo. A
heuristic draft has been written to:
- \`${draftGraphPath}\`
- \`${draftCodemapPath}\`

The heuristic only sees filenames + a 4KB content peek. Your job is to
refine it semantically by reading the actual code.

${SCHEMA_REMINDER}

## Task
1. Read \`${draftGraphPath}\` to see what was proposed and why (each node's description records the heuristic confidence + reason).
2. Walk \`${scanRoot}\` — read 3–5 representative files per domain to understand their *real* purpose. Pay attention to \`import\` statements: they reveal inter-module relations the heuristic can't see.
3. For each proposed node:
   - Refine the title to be specific (e.g. "POST /auth/login" instead of "login").
   - Replace the auto-generated description with intent-level prose.
   - Add \`relations\` based on what imports/exports actually show (\`uses\`, \`implements\`).
4. Add missing nodes:
   - **REQ nodes** for the project's high-level goals. README and module-level comments are good sources.
   - **WF nodes** for multi-step orchestrations the heuristic missed (e.g. checkout flow, order fulfillment).
5. When happy, write the refined result to:
   - \`.polaris/graph.json\` (overwrite or merge — confirm with user if uncertain)
   - \`.polaris/codemap.json\`
6. Discard the \`*.bootstrap.json\` files (or leave for diff review).

${VERIFY_BLOCK}
- Also report: total node count by type and by domain, plus any
  business-domain assumptions you made that may need user confirmation.
`;
}

export function buildEnrichPrompt(node: SpecNode, graph: Graph, codemapFiles: string[]): string {
  const inc = incoming(graph, node.id);
  const incList = inc.length === 0
    ? '(none)'
    : inc.map((e) => `\`${e.from}\` —[${e.type}]→ this`).join(', ');
  const outList = node.relations.length === 0
    ? '(none)'
    : node.relations.map((r) => `this —[${r.type}]→ \`${r.target}\``).join(', ');

  const filesBlock = codemapFiles.length === 0
    ? '⚠️  This node has no codemap entries. After enriching, add codemap entries with `pv add-file`.'
    : codemapFiles.map((f) => `- \`${f}\``).join('\n');

  return `# Polaris Vibe Spec — node enrichment request

## Target node
- **id**: \`${node.id}\`
- **type**: ${node.type}
- **domain**: ${node.domain}
- **title**: ${node.title}
- **current description**:
  > ${node.description.replace(/\n/g, '\n  > ')}

## Files mapped to this node (read these)
${filesBlock}

## Existing relations
- **Outgoing**: ${outList}
- **Incoming**: ${incList}

${SCHEMA_REMINDER}

## Task
1. Read the files listed above (skip if zero — flag this as a gap).
2. Update this node's description in \`.polaris/graph.json\`:
   - Replace any auto-generated or placeholder text with prose that reflects the code.
   - Capture *why* this node exists. The graph is the *intent* layer; the code is the *what* layer.
3. Identify missing relations by inspecting imports/exports:
   - For each external module the file uses, find the matching graph node and add a \`uses\` edge.
   - If this node implements a requirement that's already in the graph, add an \`implements\` edge.
   - If a module mutates an entity, add an \`affects\` edge to that entity node.
4. Don't fabricate relations to nodes that don't exist — if a missing dependency is important, propose adding the corresponding node and ask the user.

${VERIFY_BLOCK}
`;
}
