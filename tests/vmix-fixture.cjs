// Manual browser verification only: node tests/vmix-fixture.cjs (port 8767).
const http = require('node:http');
const {fakeVmix} = require('./helpers/fake-vmix.cjs');
const vmix = fakeVmix(16);
// A renamed Mix inside a composition exercises indirect tally propagation.
vmix.inputs.push({key: 'fixture-mix', number: 17, title: 'Retour salle', type: 'Mix', layers: []},
    {key: 'fixture-scene', number: 18, title: 'Composition', type: 'Colour', layers: [{index: 0, inputKey: 'fixture-mix'}]});
const fixture = {hideOverlays: false, omitPositions: false, active: 2, preview: 1, mixProgram: 3, mixPreview: 4};
const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if(url.pathname === '/fixture' && req.method === 'POST') {
        let body = '';
        for await(const chunk of req) body += chunk;
        const value = JSON.parse(body);
        for(const key of Object.keys(fixture)) if(typeof value[key] === 'boolean') fixture[key] = value[key];
        if(Number.isInteger(value.active) && vmix.inputs.some(i => i.number === value.active)) fixture.active = value.active;
        if(Number.isInteger(value.preview) && vmix.inputs.some(i => i.number === value.preview)) fixture.preview = value.preview;
        for(const key of ['mixProgram', 'mixPreview']) if(Number.isInteger(value[key]) && vmix.inputs.some(i => i.number === value[key])) fixture[key] = value[key];
        if(value.media) {
            const input = vmix.inputs.find(i => i.key === value.media.key);
            if(input) for(const key of ['title', 'shortTitle', 'type', 'duration', 'position', 'loop']) {
                if(value.media[key] !== undefined) input[key] = value.media[key];
            }
        }
        if(typeof value.failNext === 'string') vmix.failNext(value.failNext);
        if(typeof value.removeHTML === 'string') {
            const index = vmix.inputs.findIndex(i => i.key === value.removeHTML && i.type === 'Browser');
            if(index !== -1) {
                vmix.inputs.splice(index, 1);
                vmix.inputs.forEach(i => i.layers = i.layers.filter(l => l.inputKey !== value.removeHTML));
            }
        }
        res.end(JSON.stringify(fixture)); return;
    }
    if(url.pathname === '/stats') { res.end(JSON.stringify({inputs: vmix.inputs, calls: vmix.calls})); return; }
    if(url.searchParams.has('Function')) {
        try { await vmix.command(url.searchParams.get('Function'), Object.fromEntries(url.searchParams)); res.end('OK'); }
        catch(error) { res.writeHead(500); res.end(error.message); }
        return;
    }
    const inputs = vmix.inputs.map(i => '<input number="' + i.number + '" key="' + escape(i.key) + '" title="' + escape(i.title) + '" shortTitle="' + escape(i.shortTitle || i.title) + '" type="' + escape(i.type) + '" url="' + escape(i.url) + '"' + ['duration', 'position'].filter(key => i[key] !== undefined).map(key => ' ' + key + '="' + escape(i[key]) + '"').join('') + ' loop="' + (i.loop ? 'True' : 'False') + '" muted="False" meterF1="0.2" meterF2="0.3">' + (fixture.hideOverlays ? [] : i.layers.filter(l => l.enabled !== false)).map(l => {
        const p = l.position || {zoomX: 100, zoomY: 100, panX: 0, panY: 0};
        return '<overlay index="' + l.index + '" key="' + escape(l.inputKey) + '">' + (fixture.omitPositions ? '' : '<position zoomX="' + p.zoomX / 100 + '" zoomY="' + p.zoomY / 100 + '" panX="' + p.panX / 100 + '" panY="' + p.panY / 100 + '"/>') + '</overlay>';
    }).join('') + '</input>').join('');
    res.end('<vmix><preview>' + fixture.preview + '</preview><active>' + fixture.active + '</active><mix number="2"><preview>' + fixture.mixPreview + '</preview><active>' + fixture.mixProgram + '</active></mix><inputs>' + inputs + '</inputs><audio><master muted="False" meterF1="0.8" meterF2="0.4"/><busA muted="False" meterF1="0.02" meterF2="0.06"/><busB muted="True" meterF1="0.1" meterF2="0.9"/></audio>' + ['recording', 'external', 'streaming', 'playList', 'multiCorder', 'fullscreen'].map(s => '<' + s + '>False</' + s + '>').join('') + '</vmix>');
}).listen(8767, '127.0.0.1', () => console.log('Simulated vMix: http://127.0.0.1:8767/api'));
