const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../public/js/multiview-model');
const {build} = require('../scripts/build-public.cjs');

test('the public site serves the home page while root legacy URLs and explicit viewer paths retain the overlay', async () => {
    const {createServer} = require('../server');
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
        for(const suffix of ['/', '/?utm_source=github']) {
            const response = await fetch(base + suffix);
            assert.equal(response.status, 200);
            assert.match(await response.text(), /Tout votre live/);
            assert.equal(response.headers.get('x-robots-tag'), null);
        }
        for(const suffix of ['/?Inputs=key:test-id&Settings=%5B%5D', '/?Input=key:test-id', '/index.html?Inputs=key:test-id', '/viewer.html?PC=regie']) {
            const response = await fetch(base + suffix);
            assert.match(await response.text(), /class="outerContainer"/);
            assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
        }
        for(const suffix of ['/server.js', '/.env', '/../../server.js', '/scripts/web-files.cjs', '/public/config.html']) assert.equal((await fetch(base + suffix)).status, 404);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('official HTTPS sites synchronize a PC with its local viewer; other PCs, foreign origins and rebinding hosts stay isolated', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openmultiview-public-sync-'));
    // Reload only this module so this test's writes remain in a disposable folder.
    const previous = process.env.MULTIVIEW_DATA_DIR;
    process.env.MULTIVIEW_DATA_DIR = directory;
    delete require.cache[require.resolve('../server')];
    const {createServer} = require('../server');
    if(previous === undefined) delete process.env.MULTIVIEW_DATA_DIR; else process.env.MULTIVIEW_DATA_DIR = previous;
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const config = {version: 1, pc: 'regie', host: '127.0.0.1', port: '8088', updated: 51, screens: [M.screen(['root-id'])]};
    try {
        for(const origin of M.PUBLIC_ORIGINS) {
            const options = await fetch(base + '/control-api?PC=regie', {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Private-Network': 'true'}});
            assert.equal(options.status, 204);
            assert.equal(options.headers.get('access-control-allow-origin'), origin);
            assert.equal(options.headers.get('access-control-allow-private-network'), 'true');
        }
        const put = await fetch(base + '/control-api?PC=regie', {method: 'PUT', headers: {Origin: M.PUBLIC_ORIGINS[0], 'Content-Type': 'application/json'}, body: JSON.stringify(config)});
        assert.equal(put.status, 200);
        const get = await fetch(base + '/control-api?PC=regie', {headers: {Origin: 'http://localhost:5500'}});
        assert.deepEqual(await get.json(), config);
        assert.equal(await (await fetch(base + '/control-api?PC=other')).json(), null);
        const report = {session: 'cef', screen: 1, configUpdated: 51, vmixConnected: true, hasLayers: true, enabled: true};
        assert.equal((await fetch(base + '/presence-api?PC=regie', {method: 'POST', headers: {Origin: M.PUBLIC_ORIGINS[0], 'Content-Type': 'application/json'}, body: JSON.stringify(report)})).status, 200);
        assert.equal((await (await fetch(base + '/presence-api?PC=regie', {headers: {Origin: M.PUBLIC_ORIGINS[0]}})).json())[0].session, 'cef');
        for(const origin of ['https://evil.example', M.PUBLIC_ORIGINS[0] + '.evil.example', 'null']) {
            const denied = await fetch(base + '/control-api?PC=regie', {headers: {Origin: origin}});
            assert.equal(denied.status, 403);
            assert.equal(denied.headers.get('access-control-allow-origin'), null);
        }
        const rebinding = await fetch(base + '/control-api?PC=regie', {headers: {Host: 'rebinding.example', Origin: 'http://rebinding.example'}});
        assert.equal(rebinding.status, 403);
    } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, {recursive: true, force: true}); }
});

test('a custom HTTPS origin can be explicitly trusted, while invalid origin declarations are refused', () => {
    const {createServer} = require('../server');
    const server = createServer({publicOrigins: ['https://multiview.example']});
    server.close();
    for(const origin of ['http://external.example', 'https://multiview.example/path', 'https://user:pass@multiview.example', 'https://multiview.example/?query=1']) {
        assert.throws(() => createServer({publicOrigins: [origin]}));
    }
});

test('static publishing changes canonical and sitemap URLs, ships legacy dispatch, and excludes the companion and private files', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openmultiview-site-'));
    const publicURL = 'https://example.com/community/';
    try {
        await fs.writeFile(path.join(directory, '.env'), 'private-test-data');
        await fs.writeFile(path.join(directory, 'server.log'), 'private-test-log');
        await build({directory, publicURL});
        const home = await fs.readFile(path.join(directory, 'index.html'), 'utf8');
        assert.match(home, /rel="canonical" href="https:\/\/example.com\/community\/"/);
        assert.match(home, /property="og:image" content="https:\/\/example.com\/community\/assets\/social-card.jpg"/);
        const structured = JSON.parse(home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
        assert.equal(structured['@graph'][0].url, publicURL);
        assert.equal(structured['@graph'][0].name, 'OpenMultiview');
        assert.match(await fs.readFile(path.join(directory, 'sitemap.xml'), 'utf8'), /https:\/\/example.com\/community\/guide.html/);
        assert.match(await fs.readFile(path.join(directory, 'viewer.html'), 'utf8'), /noindex, follow/);
        assert.match(await fs.readFile(path.join(directory, 'js/site.js'), 'utf8'), /viewer\.html/);
        const model = require(path.join(directory, 'js/multiview-model.js'));
        assert.deepEqual(model.syncBases(publicURL + 'config.html'), ['http://127.0.0.1:8090/']);
        for(const name of ['server.js', '.env', 'tests', '.github', 'server.log', 'package.json']) {
            await assert.rejects(fs.access(path.join(directory, name)));
        }
        assert.equal((await fs.stat(path.join(directory, 'assets/social-card.jpg'))).size > 1000, true);
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});

test('publishing refuses invalid URLs and cannot replace the repository or an unrelated directory', async () => {
    await assert.rejects(build({publicURL: 'http://public.example/'}));
    await assert.rejects(build({directory: path.resolve(__dirname, '..')}), /only replace dist/);
    await assert.rejects(build({directory: os.tmpdir()}), /only replace dist/);
});

test('static legacy dispatch preserves source IDs, settings and fragments byte for byte', async () => {
    const source = await fs.readFile(path.join(__dirname, '../public/js/site.js'), 'utf8');
    const search = '?Inputs=key:some-id,key:another-id&Settings=%5B%7B%22fontSize%22%3A70%7D%5D&MaskSettings=%5B%5D';
    let destination;
    vm.runInNewContext(source, {URL, URLSearchParams, location: {href: 'https://example.com/app/index.html' + search + '#screen', search, hash: '#screen', replace: value => destination = value}});
    assert.equal(destination, 'https://example.com/app/viewer.html' + search + '#screen');
    let queried;
    vm.runInNewContext(source, {URL, URLSearchParams, location: {search: '?utm_source=github'}, document: {getElementById: value => {queried = value; return null;}}});
    assert.equal(queried, 'demoScreen');
    const hash = '#Inputs=key%3Ademo&Config=%7B%22v%22%3A1%7D';
    vm.runInNewContext(source, {URL, URLSearchParams, location: {href: 'https://example.com/app/index.html' + hash, search: '', hash, replace: value => destination = value}});
    assert.equal(destination, 'https://example.com/app/viewer.html' + hash);
});
