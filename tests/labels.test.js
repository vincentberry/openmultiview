const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../multiview-model');

function labelScope() {
    const empty = new Proxy({length:0}, {get:(_,key)=>key==='length'?0:()=>empty});
    const scope = vm.createContext({MultiviewModel:M,URLSearchParams,console,
        window:{location:{href:'http://localhost/index.html',search:''}},document:{},Option:function(){},$:()=>empty,
        setInterval:()=>0,setTimeout:()=>0,clearTimeout(){}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../script.js'),'utf8'),scope);
    scope.vMixInputs = [
        {key:'cam',number:1,title:'Caméra A',type:'Capture'},
        {key:'clip',number:2,title:'Clip B',type:'Video'},
        {key:'output',number:3,title:'OUTPUT',type:'Output'},
        {key:'preview',number:4,title:'PREVIEW',type:'Preview'},
        {key:'mix',number:5,title:'Mix 2',type:'Mix'},
        {key:'mix-preview',number:6,title:'Mix 2 PVW',type:'Mix'},
        {key:'list',number:7,title:'OUTPUT - Preview - Liste',type:'VideoList'},
        {key:'virtual',number:8,title:'Virtual - Clip B',type:'Virtual',shortTitle:'Clip B'}
    ];
    scope.vMixSettings.programNumber=1; scope.vMixSettings.previewNumber=2;
    scope.lastResponse={querySelector:selector=>selector==='mix[number="2"]'?{getElementsByTagName:name=>
        name==='active'?[{innerHTML:'2'}]:name==='preview'?[{textContent:'1'}]:[]}:null};
    return scope;
}

test('programme and preview labels follow their current sources while preserving the routed input binding',()=>{
    const scope=labelScope(), output={inputKey:'output',inputName:'OUTPUT'}, preview={inputKey:'preview',inputName:'PREVIEW'};
    assert.equal(scope.getLayerDisplayName(output),'Caméra A');
    assert.equal(scope.getLayerDisplayName(preview),'Clip B');
    scope.vMixSettings.programNumber=2; scope.vMixSettings.previewNumber=1;
    assert.equal(scope.getLayerDisplayName(output),'Clip B');
    assert.equal(scope.getLayerDisplayName(preview),'Caméra A');
    scope.vMixInputs[1].title='Clip renommé';
    assert.equal(scope.getLayerDisplayName(output),'Clip renommé');
    scope.vMixSettings.programNumber=8;
    assert.equal(scope.getLayerDisplayName(output),'Virtual - Clip B');
    scope.vMixSettings.programNumber=99;
    assert.equal(scope.getLayerDisplayName(output),'OUTPUT');
    assert.deepEqual(output,{inputKey:'output',inputName:'OUTPUT'});
    assert.equal(scope.vMixInputs[2].title,'OUTPUT');
});

test('Mix programme and preview follow their own buses, and media names containing OUTPUT or Preview stay literal',()=>{
    const scope=labelScope();
    assert.equal(scope.getLayerDisplayName({inputKey:'mix'}),'Clip B');
    assert.equal(scope.getLayerDisplayName({inputKey:'mix-preview'}),'Caméra A');
    for(const type of ['VideoList','Video','Audio','Image']) {
        scope.vMixInputs[6].type=type;
        assert.equal(scope.getLayerDisplayName({inputKey:'list'}),'OUTPUT - Preview - Liste');
        assert.equal(scope.getLayerMonitorRole(scope.vMixInputs[6]),'');
    }
    scope.vMixInputs[6].shortTitle='OUTPUT - Preview - Liste';
    scope.vMixInputs[7].shortTitle='OUTPUT - Preview - Liste';
    scope.vMixInputs[7].title='Virtual - OUTPUT - Preview - Liste';
    assert.equal(scope.getLayerDisplayName({inputKey:'virtual'}),'Virtual - OUTPUT - Preview - Liste');
    assert.equal(scope.getLayerMonitorRole(scope.vMixInputs[7]),'');
    assert.equal(scope.getLayerMonitorRole({type:'Output',title:'Sortie antenne'}),'PGM');
    assert.equal(scope.getLayerMonitorRole({type:'Preview',title:'Retour'}),'PVW');
});

test('each API poll updates routed titles without rebuilding layers, and unchanged titles do not rewrite the DOM',()=>{
    const scope=labelScope(), values=new Map(), writes=[];
    scope.multiViewOverlays=[{layerKey:'out-layer',inputKey:'output',inputName:'OUTPUT'},{layerKey:'pvw-layer',inputKey:'preview',inputName:'PREVIEW'}];
    scope.document.getElementById=id=>id;
    scope.$=id=>({find:()=>({text(value){if(value===undefined)return values.get(id)?.text;values.set(id,{text:value});writes.push(id);return this;},attr(name,value){values.get(id)[name]=value;return this;}})});
    scope.updateLayerLabels();
    assert.equal(values.get('out-layer').text,'Caméra A');
    assert.equal(values.get('pvw-layer').title,'Clip B');
    scope.updateLayerLabels();assert.equal(writes.length,2);
    scope.vMixSettings.programNumber=2;
    scope.updateLayerLabels();
    assert.equal(values.get('out-layer').text,'Clip B');
    assert.equal(writes.length,3);
    assert.equal(scope.multiViewOverlays[0].inputKey,'output');
});

test('role visibility can be set for the whole PC and then overridden on one layer, with URL and theme recall',()=>{
    const config={version:1,pc:'labels-demo',host:'127.0.0.1',port:'8088',updated:1,
        screens:[{...M.screen(['root-a']),theme:'classic',tiles:[{key:'a',value:{name:true,vu:false}}]},
            {...M.screen(['root-b']),theme:'openmultiview',tiles:[{key:'b',value:{name:false}}]}]};
    for(const enabled of [false,true]) {
        const next=M.applyRoleBadges(config,enabled);
        assert.equal(next.roleBadges,enabled);
        assert.equal(next.screens[0].tiles[0].value.name,true);
        assert.equal(next.screens[1].tiles[0].value.name,false);
        assert.equal(next.screens[0].tiles[0].value.vu,false);
        for(const s of next.screens) assert.equal(s.tiles[0].value.roleBadge,enabled);
        next.screens[0].tiles[0].value.roleBadge=!enabled;
        const restored=M.unpack(M.pack(next));
        assert.equal(restored.roleBadges,enabled);
        assert.equal({...M.tileDefaultsFor('classic',undefined,restored.roleBadges),...restored.screens[0].tiles[0].value}.roleBadge,!enabled);
        const params=M.urlParameters(M.recallURL('http://localhost/',restored,1));
        assert.equal(JSON.parse(params.get('MaskSettings'))[0].value.roleBadge,enabled);
        assert.deepEqual(restored.screens.map(s=>s.inputs),config.screens.map(s=>s.inputs));
    }
    assert.equal(config.roleBadges,undefined);
    assert.equal(M.tileDefaultsFor('classic').roleBadge,false);
    assert.equal(M.tileDefaultsFor('openmultiview').roleBadge,true);
    assert.throws(()=>M.applyRoleBadges(config,'false'),/repères invalide/);
});
