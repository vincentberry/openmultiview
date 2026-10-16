const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const M = require('../public/js/multiview-model');

test('local static pages discover the PC bridge after their own server, while hosted pages stay on their site', () => {
    assert.deepEqual(M.syncBases('http://127.0.0.1:5500/index.html?PC=regie'), ['http://127.0.0.1:5500/','http://127.0.0.1:8090/']);
    assert.deepEqual(M.syncBases('http://localhost:5500/config.html'), ['http://localhost:5500/','http://127.0.0.1:8090/']);
    assert.deepEqual(M.syncBases('http://127.0.0.1:8090/index.html'), ['http://127.0.0.1:8090/']);
    assert.deepEqual(M.syncBases('https://multiview.example/index.html'), ['https://multiview.example/']);
    assert.deepEqual(M.syncBases('https://vincentberry.github.io/openmultiview/config.html'), ['http://127.0.0.1:8090/']);
    assert.deepEqual(M.syncBases('https://vincentberry.github.io/openmultiview/viewer.html'), ['http://127.0.0.1:8090/']);
    assert.deepEqual(M.syncBases('https://vincentberry.github.io.evil.example/config.html'), ['https://vincentberry.github.io.evil.example/']);
    for(const url of ['https://127.0.0.1','http://127.0.0.1.evil.example','http://localhost.evil.example','http://localhost@evil.example','null']) assert.equal(M.isLoopbackURL(url), false);
});

test('every local edit has a newer revision, even within the same millisecond or after a clock change', () => {
    assert.equal(M.nextUpdate(100,100),101);
    assert.equal(M.nextUpdate(100,90),101);
    assert.equal(M.nextUpdate(100,200),200);
});

test('configuration and CEF pages on different local origins share updates through the bridge with CORS preflight', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'multiview-sync-'));
    process.env.MULTIVIEW_DATA_DIR = dir;
    const {createServer} = require('../server');
    const server = createServer();
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const endpoint = base + '/control-api?PC=regie';
    const chromeOrigin = 'http://127.0.0.1:5500';
    const cefOrigin = 'http://localhost:5500';
    const config = {version:1,pc:'regie',host:'127.0.0.1',port:'8088',updated:10,screens:[M.screen(['root'])]};
    try {
        const preflight = await fetch(endpoint,{method:'OPTIONS',headers:{Origin:chromeOrigin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});
        assert.equal(preflight.status,204);
        assert.equal(preflight.headers.get('access-control-allow-origin'),chromeOrigin);
        assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
        assert.match(preflight.headers.get('access-control-allow-headers'), /Content-Type/i);
        const put = value => fetch(endpoint,{method:'PUT',headers:{Origin:chromeOrigin,'Content-Type':'application/json'},body:JSON.stringify(value)});
        assert.equal((await put(config)).status,200);
        const get = () => fetch(endpoint,{headers:{Origin:cefOrigin}});
        const first = await get();
        assert.equal(first.headers.get('access-control-allow-origin'),cefOrigin);
        assert.deepEqual(await first.json(),config);
        const edited = M.clone(config);
        edited.updated = M.nextUpdate(edited.updated,10);
        edited.screens[0].theme = 'openmultiview';
        edited.screens[0].tiles = [{key:'source-root-layer-0',value:{titlePosition:'below',titleBackground:false,vuPosition:'outside-right'}}];
        await put(edited);
        assert.deepEqual(await (await get()).json(),edited);
        await put(config);
        assert.deepEqual(await (await get()).json(),edited);
        const report = {session:'cef-page',screen:1,configUpdated:edited.updated,vmixConnected:true,hasLayers:true,enabled:true};
        const presence = await fetch(base + '/presence-api?PC=regie',{method:'POST',headers:{Origin:cefOrigin,'Content-Type':'application/json'},body:JSON.stringify(report)});
        assert.equal(presence.status,200);
        assert.equal(presence.headers.get('access-control-allow-origin'),cefOrigin);
        const connected = await (await fetch(base + '/presence-api?PC=regie',{headers:{Origin:chromeOrigin}})).json();
        assert.equal(connected[0].configUpdated,edited.updated);
        for(const origin of ['https://external.example','http://localhost.evil.example','null']) {
            const denied = await fetch(endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT'}});
            assert.equal(denied.status,403);
            assert.equal(denied.headers.get('access-control-allow-origin'),null);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(dir,{recursive:true,force:true});
    }
});
