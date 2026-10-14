const {test} = require('node:test');
const assert = require('node:assert/strict');
const {auditFile} = require('../scripts/audit-public.cjs');

test('the public audit flags credentials, real settings and personal metadata without exposing their values', () => {
    assert.deepEqual(auditFile('.env', Buffer.from('sample')), ['private file']);
    assert.deepEqual(auditFile('example.js', Buffer.from('ghp_' + 'x'.repeat(35))), ['credential pattern']);
    assert.deepEqual(auditFile('pc.json', Buffer.from(JSON.stringify({version: 1, pc: 'demo', screens: []}))), ['PC configuration']);
    assert.deepEqual(auditFile('example.js', Buffer.from('192.168.' + '42.7')), ['non-example network address']);
    const metadata = Buffer.alloc(12);
    metadata.write('iTXt', 4);
    assert.deepEqual(auditFile('image.png', Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), metadata])), ['image metadata']);
    assert.deepEqual(auditFile('.env.example', Buffer.from('127.0.0.1 198.51.100.10')), []);
});
