const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../desktop/policy.cjs');
const origin = 'http://127.0.0.1:8090';

test('offline app resources and local vMix API calls are allowed without public requests', () => {
    for(const url of [origin + '/config.html', origin + '/connection.js', 'http://127.0.0.1:8088/api', 'http://localhost:8088/api/?Function=BrowserNavigate', 'http://vmix-pc:8088/api', 'http://vmix.local:8088/api']) assert.equal(P.allowRequest(url, origin, 'xhr'), true, url);
    for(const url of ['https://vincentberry.github.io/openmultiview/config.html', 'https://example.com/script.js', 'http://localhost.evil.example:8088/api', 'file:///private-file', 'http://user:password@127.0.0.1:8088/api', 'http://127.0.0.1:8088/other']) assert.equal(P.allowRequest(url, origin, 'xhr'), false, url);
    assert.equal(P.allowRequest('data:image/png;base64,AA', origin, 'image'), true);
    assert.equal(P.allowRequest('data:text/html,hello', origin, 'mainFrame'), false);
});

test('multiview and guide links stay inside the app while system and file protocols are rejected', () => {
    for(const page of ['config.html', 'index.html', 'guide.html', 'guide.en.html', 'privacy.es.html']) assert.equal(P.appPage(origin + '/' + page, origin), true);
    assert.equal(P.appPage('https://example.com/config.html', origin), false);
    assert.equal(P.appPage(origin + '/server.js', origin), false);
    for(const url of ['file:///private-file', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:password@example.com/']) assert.equal(P.externalLink(url), false);
    assert.equal(P.externalLink('https://www.vmix.com/help29/'), true);
    assert.equal(P.externalLink('http://127.0.0.1:8088/api'), true);
});

test('desktop server serves the same complete interface with offline mode and a local display URL', async () => {
    const server = require('../server').createServer({desktop: true});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
        assert.match(await (await fetch(base + '/config.html')).text(), /<body data-desktop="true" class="config-page">/);
        assert.match(await (await fetch(base + '/index.html')).text(), /data-desktop="true"/);
        for(const asset of ['/connection.js', '/studio.js', '/guide.html', '/assets/openmultiview-icon.png']) assert.equal((await fetch(base + asset)).status, 200, asset);
        const M = require('../multiview-model');
        const config = {version: 1, pc: 'offline-test', host: '127.0.0.1', port: '8088', updated: 1, screens: [M.screen(['root'])]};
        const display = new URL(M.recallURL(base + '/config.html', config, 0, {linked: true}));
        assert.equal(display.origin, base);
        assert.equal(display.pathname, '/index.html');
    } finally { await new Promise(resolve => server.close(resolve)); }
});
