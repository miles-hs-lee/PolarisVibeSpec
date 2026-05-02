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

export interface ImpactResult {
  root: string;
  depth: number;
  impacted_nodes: string[];
  impacted_files: string[];
  inferred_files: string[];
  warnings: string[];
}

export interface QueryHit {
  id: string;
  score: number;
  matched_on: string[];
}

export const DEFAULT_IMPACT_DEPTH = 3;
