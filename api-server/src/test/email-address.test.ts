/**
 * The address check that guards every outgoing email.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlainEmailAddress } from '../utils/email.js';

test('accepts ordinary addresses', () => {
  for (const a of [
    'alyssa@example.com',
    'first.last+tag@sub.example.co.uk',
    "o'brien@example.ie",
    'e2e-test@example.com',
  ]) {
    assert.equal(isPlainEmailAddress(a), true, a);
  }
});

test('refuses anything that is more than one plain mailbox', () => {
  for (const a of [
    '',
    'no-at-sign',
    'a@b',
    'two@example.com,three@example.com',
    'two@example.com; three@example.com',
    'Name <name@example.com>',
    '"quoted"@example.com',
    'name(comment)@example.com',
    'group: a@example.com;',
    'name@example.com\r\nBcc: x@example.com',
    ' name@example.com',
    'name@-example.com',
    `${'a'.repeat(250)}@example.com`,
  ]) {
    assert.equal(isPlainEmailAddress(a), false, JSON.stringify(a));
  }
});

test('refuses non-strings', () => {
  for (const a of [undefined, null, 42, ['a@example.com'], { address: 'a@example.com' }]) {
    assert.equal(isPlainEmailAddress(a), false, String(a));
  }
});
