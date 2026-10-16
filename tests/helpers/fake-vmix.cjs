const assert = require('node:assert/strict');
const M = require('../../public/js/multiview-model');
function fakeVmix(count = 16) {
    const inputs = Array.from({length: count}, (_, i) => ({key: 'camera-' + (i + 1), number: i + 1, title: i === 0 ? 'PVW' : i === 1 ? 'PGM' : 'CAM ' + (i + 1), type: 'Capture', layers: []}));
    const calls = [];
    let nextId = count + 1;
    let failure;
    const api = {inputs, calls, failNext: functionName => failure = functionName,
        readInputs: async () => M.clone(inputs), command: async (name, args) => {
            calls.push({name, ...args});
            if(name === failure && name !== 'AddInput') { failure = undefined; throw new Error('Interruption simulée'); }
            if(name === 'AddInput') {
                inputs.push({key: 'created-' + nextId++, number: Math.max(...inputs.map(i => i.number)) + 1, title: args.Value, type: args.Value.startsWith('Browser|') ? 'Browser' : 'Colour', layers: []});
                if(failure === name) { failure = undefined; throw new Error('Réponse perdue après création'); }
                return;
            }
            const input = inputs.find(i => i.key === args.Input);
            assert.ok(input, 'Commands must target an existing stable ID');
            if(name === 'SetInputName') input.title = args.Value;
            if(name === 'BrowserNavigate') input.url = args.Value;
            if(name === 'LayerOff' || name === 'LayerOn') {
                const layer = input.layers.find(l => l.index === +args.Value - 1);
                if(layer) layer.enabled = name === 'LayerOn';
            }
            if(name === 'SetLayer') {
                const [slot, child] = args.Value.split(',');
                assert.ok(+slot >= 1 && +slot <= 10);
                assert.ok(inputs.some(i => i.key === child));
                const previous = input.layers.find(l => l.index === +slot - 1);
                if(previous) { previous.inputKey = child; previous.position = previous.position || {zoomX: 100, zoomY: 100, panX: 0, panY: 0}; }
                else input.layers.push({index: +slot - 1, inputKey: child, position: {zoomX: 100, zoomY: 100, panX: 0, panY: 0}});
            }
            const match = name.match(/^SetLayer(\d+)(Zoom|PanX|PanY)$/);
            if(match) {
                const layer = input.layers.find(l => l.index === +match[1] - 1);
                if(match[2] === 'Zoom') layer.position.zoomX = layer.position.zoomY = +args.Value * 100;
                else layer.position[match[2] === 'PanX' ? 'panX' : 'panY'] = +args.Value * 100;
            }
        }};
    return api;
}

module.exports = {fakeVmix};
