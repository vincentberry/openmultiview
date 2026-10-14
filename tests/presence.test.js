const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('../server');

test('page presence is isolated by PC, carries vMix status, closes and expires', async () => {
    let now = 1000;
    const server = createServer({now: () => now});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const report = {session: 'page-a', screen: 3, configUpdated: 5, vmixConnected: true, hasLayers: true, enabled: true};
    const post = value => fetch(base + '/presence-api?PC=test', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
    const get = pc => fetch(base + '/presence-api?PC=' + pc).then(r => r.json());
    try {
        assert.equal((await post(report)).status, 200);
        assert.equal((await get('test'))[0].screen, 3);
        assert.equal((await get('test'))[0].vmixConnected, true);
        assert.deepEqual(await get('other'), []);
        await post({...report, vmixConnected: false});
        assert.equal((await get('test'))[0].vmixConnected, false);
        await post({...report, closed: true});
        assert.deepEqual(await get('test'), []);
        await post(report);
        now += 12001;
        assert.deepEqual(await get('test'), []);
        assert.equal((await post({...report, screen: 0})).status, 400);
        assert.equal((await fetch(base + '/presence-api?PC=test', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://unrelated.example'}, body: JSON.stringify(report)})).status, 403);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
