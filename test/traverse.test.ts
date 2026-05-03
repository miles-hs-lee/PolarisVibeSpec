import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { impactTraverse } from '../src/graph/traverse';
import { makeNode, emptyGraph } from './helpers';

/**
 * Build a small auth-domain graph that exercises every relation type.
 *
 *   REQ-001  ← implements ─ API-LOGIN
 *                                │ uses
 *                                ▼
 *                            ENT-USER  ← affects ── WF-LOGIN
 *                                                       │ uses
 *                                                       ▼
 *                                                   API-LOGIN
 */
function buildGraph() {
  const g = emptyGraph();
  g.nodes['REQ-001'] = makeNode({ id: 'REQ-001', type: 'requirement', domain: 'AUTH' });
  g.nodes['ENT-USER'] = makeNode({ id: 'ENT-USER', type: 'entity', domain: 'AUTH' });
  g.nodes['API-LOGIN'] = makeNode({
    id: 'API-LOGIN',
    type: 'api',
    domain: 'AUTH',
    relations: [
      { type: 'implements', target: 'REQ-001' },
      { type: 'uses', target: 'ENT-USER' }
    ]
  });
  g.nodes['WF-LOGIN'] = makeNode({
    id: 'WF-LOGIN',
    type: 'workflow',
    domain: 'AUTH',
    relations: [
      { type: 'uses', target: 'API-LOGIN' },
      { type: 'affects', target: 'ENT-USER' }
    ]
  });
  return g;
}

test('impactTraverse returns just the root when depth is 0', () => {
  const g = buildGraph();
  const r = impactTraverse(g, 'REQ-001', 0);
  assert.deepEqual(r.visited, ['REQ-001']);
});

test('impactTraverse on REQ traverses incoming implements/uses (reverse)', () => {
  // Changing REQ-001 should impact API-LOGIN (implementer) and then
  // WF-LOGIN (uses API-LOGIN).
  const g = buildGraph();
  const r = impactTraverse(g, 'REQ-001', 3);
  assert.ok(r.visited.includes('REQ-001'));
  assert.ok(r.visited.includes('API-LOGIN'), 'incoming implements');
  assert.ok(r.visited.includes('WF-LOGIN'), 'transitive incoming uses');
});

test('impactTraverse on ENT-USER finds incoming uses (API) and incoming affects ignored backward', () => {
  // affects is FORWARD-only. So incoming affects (WF -affects-> ENT) is
  // NOT followed. But incoming uses (API -uses-> ENT) IS followed.
  // Then transitively, WF -uses-> API, so WF is impacted via API.
  const g = buildGraph();
  const r = impactTraverse(g, 'ENT-USER', 3);
  assert.ok(r.visited.includes('ENT-USER'));
  assert.ok(r.visited.includes('API-LOGIN'), 'incoming uses on ENT-USER');
  assert.ok(r.visited.includes('WF-LOGIN'), 'transitive: WF -uses-> API');
});

test('impactTraverse on API-LOGIN follows outgoing affects forward (none here)', () => {
  // API-LOGIN has no outgoing affects. Its incoming uses is from WF-LOGIN.
  const g = buildGraph();
  const r = impactTraverse(g, 'API-LOGIN', 3);
  assert.ok(r.visited.includes('API-LOGIN'));
  assert.ok(r.visited.includes('WF-LOGIN'));
});

test('impactTraverse warns on dangling targets but does not crash', () => {
  const g = emptyGraph();
  g.nodes['A'] = makeNode({
    id: 'A',
    type: 'requirement',
    domain: 'X',
    relations: [{ type: 'affects', target: 'GHOST' }]
  });
  const r = impactTraverse(g, 'A', 3);
  assert.deepEqual(r.visited, ['A']);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Dangling target/);
});

test('impactTraverse handles missing root cleanly', () => {
  const g = emptyGraph();
  const r = impactTraverse(g, 'NOPE', 3);
  assert.deepEqual(r.visited, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Root node not found/);
});

test('impactTraverse respects depth cap', () => {
  // Chain: A <-uses- B <-uses- C <-uses- D. Depth 1 from A only reaches B.
  const g = emptyGraph();
  g.nodes['A'] = makeNode({ id: 'A', type: 'entity', domain: 'X' });
  g.nodes['B'] = makeNode({
    id: 'B', type: 'api', domain: 'X',
    relations: [{ type: 'uses', target: 'A' }]
  });
  g.nodes['C'] = makeNode({
    id: 'C', type: 'workflow', domain: 'X',
    relations: [{ type: 'uses', target: 'B' }]
  });
  g.nodes['D'] = makeNode({
    id: 'D', type: 'workflow', domain: 'X',
    relations: [{ type: 'uses', target: 'C' }]
  });

  const r1 = impactTraverse(g, 'A', 1);
  assert.deepEqual(r1.visited.sort(), ['A', 'B']);

  const r3 = impactTraverse(g, 'A', 3);
  assert.deepEqual(r3.visited.sort(), ['A', 'B', 'C', 'D']);
});
