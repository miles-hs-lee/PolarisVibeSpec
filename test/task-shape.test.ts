import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyIntent } from '../src/compiler/taskShape';

test('classifyIntent: empty → unknown / use_pv (default)', () => {
  const r = classifyIntent('');
  assert.equal(r.shape, 'unknown');
});

test('classifyIntent: explicit "rename X to Y" → rename / use_grep', () => {
  const r = classifyIntent('rename loginUser to authenticateUser');
  assert.equal(r.shape, 'rename');
  assert.equal(r.recommendation, 'use_grep');
});

test('classifyIntent: arrow form `foo → bar` → rename', () => {
  const r = classifyIntent('passwordHash → password_hash everywhere');
  assert.equal(r.shape, 'rename');
});

test('classifyIntent: arrow form `foo -> bar` → rename', () => {
  const r = classifyIntent('Convert camelCase identifiers like userName -> snake_case');
  assert.equal(r.shape, 'rename');
});

test('classifyIntent: snake_case mention → rename', () => {
  const r = classifyIntent('Migrate everything to snake_case naming');
  assert.equal(r.shape, 'rename');
});

test('classifyIntent: code-identifier "X to Y" without rename verb → rename', () => {
  // Both halves look like code identifiers (snake or mixedCase).
  const r = classifyIntent('Change auth_token to authToken across the api layer');
  assert.equal(r.shape, 'rename');
});

test('classifyIntent: prepositional "to" without code-identifier → NOT rename', () => {
  // "wire to pv" is feature phrasing, not rename. Important false-positive
  // guard noted in the source comment.
  const r = classifyIntent('Add a flag to pv impact for files-only output');
  assert.equal(r.shape, 'feature');
});

test('classifyIntent: scoped feature add → use_pv', () => {
  const r = classifyIntent('Add password reset link expiry');
  assert.equal(r.shape, 'feature');
  assert.equal(r.recommendation, 'use_pv');
});

test('classifyIntent: cross-domain feature (≥2 domain keywords) → strongest use_pv', () => {
  // Need a FEATURE_HINTS verb (add/implement/...) plus 2+ domain keywords.
  const r = classifyIntent('Add email notification when subscription payment fails');
  assert.equal(r.shape, 'feature');
  assert.equal(r.recommendation, 'use_pv');
  assert.match(r.reason, /Cross-domain/);
});

test('classifyIntent: refactor verbs → use_both (PV for scope, grep within)', () => {
  const r = classifyIntent('Refactor billing module to extract a fee calculator');
  assert.equal(r.shape, 'refactor');
  assert.equal(r.recommendation, 'use_both');
});

test('classifyIntent: ambiguous prose → unknown / use_pv default', () => {
  const r = classifyIntent('Investigate the latency on the dashboard');
  assert.equal(r.shape, 'unknown');
  assert.equal(r.recommendation, 'use_pv');
});

test('classifyIntent: "replace X with Y" → rename', () => {
  const r = classifyIntent('Replace `oldHelper` with newUtility throughout');
  assert.equal(r.shape, 'rename');
});
