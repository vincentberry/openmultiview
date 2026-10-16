const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../connection');

function permissionBrowser(initial = 'prompt') {
    const callbacks = [], queries = [];
    const status = {state: initial, addEventListener: (_, callback) => callbacks.push(callback)};
    return {status, queries, navigator: {userAgent: 'Chrome/150', permissions: {query: async ({name}) => { queries.push(name); return status; }}},
        change: state => { status.state = state; callbacks.forEach(callback => callback()); }};
}

test('online pages wait for an explicit connection gesture and respect a denied permission', async () => {
    const browser = permissionBrowser();
    const access = C.createAccess({href: 'https://vincentberry.github.io/openmultiview/', navigator: browser.navigator});
    await access.ready;
    assert.throws(() => access.assertAllowed('http://127.0.0.1:8088/api'), error => error.code === 'LOCAL_NETWORK_ACCESS' && error.permission === 'prompt');
    access.request();
    assert.doesNotThrow(() => access.assertAllowed('http://127.0.0.1:8088/api'));
    browser.change('denied');
    assert.throws(() => access.assertAllowed('http://127.0.0.1:8088/api'), error => error.permission === 'denied');
    browser.change('granted');
    assert.doesNotThrow(() => access.assertAllowed('http://127.0.0.1:8088/api'));
    assert.deepEqual(access.options('http://127.0.0.1:8088/api'), {targetAddressSpace: 'loopback'});
});

test('local configuration and older CEF do not query unsupported browser permissions', async () => {
    for(const href of ['http://127.0.0.1:8090/config.html', 'http://localhost:8090/config.html']) {
        const browser = permissionBrowser('denied');
        const access = C.createAccess({href, navigator: browser.navigator});
        await access.ready;
        assert.equal(browser.queries.length, 0);
        assert.doesNotThrow(() => access.assertAllowed('http://127.0.0.1:8088/api'));
    }
    const browser = permissionBrowser();
    browser.navigator.userAgent = 'Chrome/100';
    const access = C.createAccess({href: 'https://example.com/', navigator: browser.navigator});
    await access.ready;
    assert.equal(browser.queries.length, 0);
    assert.equal(access.state('http://127.0.0.1:8088/api'), 'unknown');
});

test('older LNA permission names fall back without claiming a diagnosis when unsupported', async () => {
    const navigator = {userAgent: 'Chrome/142', permissions: {query: async ({name}) => {
        if(name !== 'local-network-access') throw new TypeError('Unsupported');
        return {state: 'denied'};
    }}};
    const access = C.createAccess({href: 'https://example.com/', navigator});
    await access.ready;
    assert.equal(access.state('http://127.0.0.1:8090/'), 'denied');
    assert.deepEqual(access.options('http://127.0.0.1:8090/'), {});
    navigator.permissions.query = async () => { throw new TypeError('Unsupported'); };
    const unknown = C.createAccess({href: 'https://example.com/', navigator});
    await unknown.ready;
    assert.equal(unknown.state('http://127.0.0.1:8090/'), 'unknown');
    assert.equal(C.addressSpace('https://public.example/'), null);
    assert.equal(C.addressSpace('http://localhost.evil.example/'), null);
});

function polling(fetch) {
    const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
    const start = source.indexOf('var pollPending = false;');
    const end = source.indexOf('var overlayArray =', start);
    const chain = {text() { return chain; }, css() { return chain; }};
    const scope = vm.createContext({fetchWithTimeout: fetch, vMixSettings: {IP: '127.0.0.1', port: '8088', refreshInterval: 100},
        location: {protocol: 'https:'}, window: {DOMParser: class {parseFromString() {return {querySelector: name => name === 'vmix' ? {} : null};}}},
        vMixRefresh() {}, setInterval() {}, $: () => chain});
    vm.runInContext(source.slice(start, end), scope);
    return scope;
}

test('a read failure backs off polling and a successful retry clears the failure', async () => {
    let calls = 0;
    const scope = polling(async () => {
        calls++;
        if(calls === 1) throw new TypeError('Failed to fetch');
        return {ok: true, text: async () => '<vmix/>'};
    });
    await scope.pollVmix();
    assert.equal(scope.vmixConnection.state, 'unreachable');
    assert.match(scope.vmixConnection.message, /depuis cette page/);
    await scope.pollVmix();
    assert.equal(calls, 1);
    await scope.pollVmix(true);
    assert.equal(scope.vmixConnection.state, 'connected');
    assert.equal(scope.vmixConnection.failures, 0);
});

test('an explicit browser denial is distinguished from a vMix API failure', async () => {
    const error = Object.assign(new Error('Accès refusé'), {code: 'LOCAL_NETWORK_ACCESS', permission: 'denied'});
    const scope = polling(async () => { throw error; });
    await scope.pollVmix();
    assert.equal(scope.vmixConnection.state, 'denied');
    assert.equal(scope.vmixConnection.message, 'Accès refusé');
});

test('command acknowledgements are tracked separately from API reads and ambiguous failures', async () => {
    const source = fs.readFileSync(require.resolve('../studio.js'), 'utf8');
    const start = source.indexOf('    async function command(');
    const end = source.indexOf('    const htmlRepairKey', start);
    const scope = vm.createContext({state: {host: '127.0.0.1', port: '8088'}, URLSearchParams,
        vmixConnection: {state: 'unreachable'}, connectionChanged() {}, fetchWithTimeout: async () => ({ok: true})});
    vm.runInContext(source.slice(start, end), scope);
    await scope.command('BrowserNavigate', {Input: 'browser', Value: 'https://example.com'});
    assert.equal(scope.vmixConnection.lastCommand, 'BrowserNavigate');
    assert.equal(scope.vmixConnection.state, 'unreachable');
    scope.fetchWithTimeout = async () => { throw new TypeError('Network error'); };
    await assert.rejects(scope.command('BrowserNavigate', {}), /a pu être exécutée/);
    assert.equal(scope.vmixConnection.commandUnconfirmed, true);
    const denied = Object.assign(new Error('Accès refusé'), {code: 'LOCAL_NETWORK_ACCESS'});
    scope.fetchWithTimeout = async () => { throw denied; };
    await assert.rejects(scope.command('BrowserNavigate', {}), error => error === denied);
});

test('companion discovery identifies this application and rejects foreign origins and rebinding', async () => {
    const server = require('../server').createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/companion-api';
    try {
        const response = await fetch(url, {headers: {Origin: 'https://vincentberry.github.io'}});
        assert.equal(response.status, 200);
        assert.equal((await response.json()).application, 'OpenMultiview');
        assert.equal((await fetch(url, {headers: {Origin: 'https://foreign.example'}})).status, 403);
        const rebinding = await new Promise((resolve, reject) => require('node:http').get(url, {headers: {Host: 'rebinding.example'}}, response => { response.resume(); resolve(response.statusCode); }).on('error', reject));
        assert.equal(rebinding, 403);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
