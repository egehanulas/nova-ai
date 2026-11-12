import assert from 'node:assert/strict';
import test from 'node:test';
import { friendlyChatError } from './chat-errors';

test('maps backend categories to calm Turkish messages without exposing provider details', () => {
  assert.match(friendlyChatError(Object.assign(new Error('quota in secret provider'), { code: 'AI_RATE_LIMIT' }), true), /yoğun/i);
  assert.match(friendlyChatError(Object.assign(new Error('partial'), { code: 'AI_INCOMPLETE' }), true), /Eksik yanıt kaydedilmedi/i);
  assert.doesNotMatch(friendlyChatError(new Error('secret provider stack'), true), /secret|stack|HTTP/i);
  assert.match(friendlyChatError(new TypeError('Network request failed'), true), /İnternet bağlantısı/i);
  assert.match(friendlyChatError(new Error('write error'), false), /kaydedilemedi/i);
});
