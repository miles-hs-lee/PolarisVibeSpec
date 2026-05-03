import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectDomain, detectType } from '../src/compiler/intentToGraph';

test('detectDomain finds AUTH from auth keywords', () => {
  assert.equal(detectDomain('Add login flow'), 'AUTH');
  assert.equal(detectDomain('Reset password'), 'AUTH');
  assert.equal(detectDomain('JWT refresh'), 'AUTH');
  assert.equal(detectDomain('Passkey support'), 'AUTH');
});

test('detectDomain finds BILLING', () => {
  assert.equal(detectDomain('Stripe webhook for invoice'), 'BILLING');
  assert.equal(detectDomain('Charge subscription'), 'BILLING');
});

test('detectDomain finds ORDER', () => {
  assert.equal(detectDomain('Add cart checkout flow'), 'ORDER');
});

test('detectDomain finds NOTIF', () => {
  assert.equal(detectDomain('Send email alert'), 'NOTIF');
});

test('detectDomain falls back to GENERAL when no keywords match', () => {
  assert.equal(detectDomain('Refactor utility helpers'), 'GENERAL');
});

test('detectDomain prefers AUTH over USER when both could match', () => {
  // user-facing AUTH terminology: "user login" should be AUTH, not USER,
  // because login is the more specific signal.
  assert.equal(detectDomain('User login flow'), 'AUTH');
});

test('detectType returns api for HTTP-verb prefix', () => {
  const r = detectType('POST /auth/login validates credentials');
  assert.equal(r.type, 'api');
  assert.ok(r.hint?.includes('POST'));
});

test('detectType returns workflow for flow/process/step keywords', () => {
  assert.equal(detectType('Login flow').type, 'workflow');
  assert.equal(detectType('Order fulfillment process').type, 'workflow');
});

test('detectType returns entity for table/model/schema keywords', () => {
  assert.equal(detectType('User table with email column').type, 'entity');
  assert.equal(detectType('Order schema').type, 'entity');
});

test('detectType defaults to requirement', () => {
  assert.equal(detectType('Users can sign in with email and password').type, 'requirement');
});
