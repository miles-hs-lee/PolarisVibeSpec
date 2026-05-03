export type NodeType = 'requirement' | 'api' | 'workflow' | 'entity';

export type RelationType = 'depends_on' | 'implements' | 'affects' | 'uses';

export const NODE_TYPES: NodeType[] = ['requirement', 'api', 'workflow', 'entity'];
export const RELATION_TYPES: RelationType[] = ['depends_on', 'implements', 'affects', 'uses'];

export interface Relation {
  type: RelationType;
  target: string;
}

export interface SpecNode {
  id: string;
  type: NodeType;
  domain: string;
  title: string;
  description: string;
  tags: string[];
  relations: Relation[];
  createdAt: string;
}

export interface Graph {
  version: 1;
  nodes: Record<string, SpecNode>;
}

export interface CodeMap {
  [nodeId: string]: string[];
}

export interface Counters {
  [domainTypeKey: string]: number;
}

export type Coverage = 'narrow' | 'broad' | 'global';

export interface ImpactResult {
  root: string;
  depth: number;
  impacted_nodes: string[];
  impacted_files: string[];
  inferred_files: string[];
  warnings: string[];
  /** Total nodes in the graph at the time of analysis. */
  total_nodes: number;
  /**
   * Heuristic about how much of the graph the impact set covers — helps an
   * agent decide whether to trust the file list or also fall back to grep.
   * narrow: focused change, trust the set.
   * broad : substantial fraction touched; consider also grepping.
   * global: most of the graph; the root is foundational, expect cascades.
   */
  coverage: Coverage;
  /**
   * Total source files counted under typical roots (src/, lib/, packages/)
   * at analysis time. Used to compute read_set_ratio. Null if no scan
   * roots existed (e.g. running outside a real repo).
   */
  total_source_files: number | null;
  /**
   * impacted_files.length / total_source_files. The most legible
   * per-call signal of "how much PV narrowed the search" — easy to show
   * in an output and interpret as "agent will read X% of the repo
   * instead of grepping the whole thing." Null when total_source_files
   * is null or zero.
   */
  read_set_ratio: number | null;
}

export interface QueryHit {
  id: string;
  score: number;
  matched_on: string[];
}

export const DEFAULT_IMPACT_DEPTH = 3;

export type IntentShape = 'rename' | 'feature' | 'refactor' | 'unknown';
export type Recommendation = 'use_pv' | 'use_grep' | 'use_both';

export interface IntentClassification {
  shape: IntentShape;
  recommendation: Recommendation;
  reason: string;
}

export interface AskResult {
  intent: string;
  classification: IntentClassification;
  hits: QueryHit[];
  /** Impact computed for the top hit, or null if no hits. */
  impact: ImpactResult | null;
}
