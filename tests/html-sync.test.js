const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/config.js'), 'utf8');
const start = source.indexOf('    async function updateHTMLURLs()');
const end = source.indexOf('    function syncExtras()', start);
function setup() {
    const calls = [], notices = [], timers = [];
    const scope = vm.createContext({
        state: {host: '127.0.0.1', port: '8088', screens: [{tiles: [], managed: {browser: 'html-1'}}]},
        building: false, applying: false, htmlURLBusy: false, bridge: false, htmlURLs: new Map(),
        setTimeout: callback => timers.push(callback), clearTimeout() {}, htmlURLTimer: 0, notice: message => notices.push(message),
        browserURL: async index => 'http://localhost/index.html#configuration-' + index,
        command: async (name, args) => calls.push({name, ...args})
    });
    vm.runInContext(source.slice(start, end), scope);
    return {scope, calls, notices, timers};
}

test('HTML configuration changes navigate and reload each input, and unchanged settings do not reload again', async () => {
    const {scope, calls} = setup();
    await scope.updateHTMLURLs();
    assert.deepEqual(calls.map(c => c.name), ['BrowserNavigate', 'BrowserReload']);
    assert.ok(calls.every(c => c.Input === 'html-1'));
    await scope.updateHTMLURLs();
    assert.equal(calls.length, 2);
    scope.state.screens[0].tiles.push({key: 'layer-1', value: {name: false}});
    await scope.updateHTMLURLs();
    assert.equal(calls.length, 4);
    scope.state.screens.push({managed: {browser: 'html-2'}});
    await scope.updateHTMLURLs();
    assert.equal(calls.at(-1).Input, 'html-2');
    assert.equal(calls.length, 6);
});

test('HTML refresh waits during construction and allows retry after a navigation failure', async () => {
    const {scope, calls, notices, timers} = setup();
    scope.building = true;
    await scope.updateHTMLURLs();
    assert.equal(calls.length, 0);
    assert.equal(timers.length, 1);
    scope.building = false;
    const command = scope.command;
    scope.command = async () => { throw new Error('vMix indisponible'); };
    await timers[0]();
    assert.equal(scope.htmlURLBusy, false);
    assert.equal(scope.htmlURLs.size, 0);
    assert.match(notices[0], /vMix indisponible/);
    scope.command = command;
    await scope.updateHTMLURLs();
    assert.equal(calls.length, 2);
});
