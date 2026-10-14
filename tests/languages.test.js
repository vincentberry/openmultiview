const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const I = require('../i18n');
const M = require('../multiview-model');
const {build} = require('../scripts/build-public.cjs');

test('language changes translate interface copy and dynamic status while preserving source names and IDs', () => {
    assert.equal(I.translate('Sources & layers', 'es'), 'Fuentes y layers');
    assert.equal(I.translate('  Écran 12  ', 'en'), '  Screen 12  ');
    assert.equal(I.translate('Page connectée · vMix OK', 'es'), 'Página conectada · vMix OK');
    assert.equal(I.translate('Entrée 57 · Disposition', 'en'), 'Input 57 · Disposition');
    assert.equal(I.translate('Utiliser Régie', 'es'), 'Usar Régie');
    assert.equal(I.translate('ID vMix : camera-stable-id', 'en'), 'vMix ID: camera-stable-id');
    assert.equal(I.translate('Source personnalisée jamais modifiée', 'es'), 'Source personnalisée jamais modifiée');
    assert.equal(I.translate('English', 'es'), 'English');
    assert.equal(I.translate('Vumètre : Master', 'en'), 'Meter: Master');
    assert.equal(I.translate('Vumètre : BUS B · indisponible dans vMix', 'es'), 'Vúmetro: BUS B · no disponible en vMix');
    assert.equal(I.translate('Source HTML rétablie au layer 10 de l’écran 2. Les IDs et les positions vidéo sont conservés.', 'en'), 'HTML source restored on screen 2 layer 10. IDs and video positions are preserved.');
    assert.equal(I.translate('vMix a refusé BrowserNavigate (414). Relancez la construction après vérification.', 'es'), 'vMix ha rechazado BrowserNavigate (414). Comprueba la configuración y vuelve a crearla.');
    assert.equal(I.valid('unknown'), 'fr');
});

test('localized recall URLs keep identical configuration, stable input references and legacy fields', () => {
    const config = {version:1, pc:'locale-demo',host:'127.0.0.1',port:'8088',updated:1,screens:[{...M.screen(['root-demo']),theme:'openmultiview'}]};
    const original = new URL(M.recallURL('http://localhost/',config,0));
    for(const language of I.languages) {
        const url = new URL(M.recallURL('http://localhost/',config,0,{language}));
        assert.equal(url.searchParams.get('Lang'), language === 'fr' ? null : language);
        for(const field of ['Inputs','Settings','MaskSettings','PC','Screen','Config','Theme']) assert.equal(url.searchParams.get(field),original.searchParams.get(field));
    }
});

test('the static build includes complete language pages, reciprocal alternates and localized canonical metadata', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),'openmultiview-site-'));
    const base='https://example.com/multiview/';
    try {
        await build({directory,publicURL:base});
        for(const [language,home] of [['fr','index.html'],['en','en.html'],['es','es.html']]) {
            const source=await fs.readFile(path.join(directory,home),'utf8');
            assert.match(source,new RegExp('<html lang="'+language+'"'));
            assert.ok(source.includes(I.translate('Tout votre live.',language)));
            const canonical=base+(language==='fr'?'':home);
            assert.ok(source.includes('rel="canonical" href="'+canonical+'"'));
            assert.ok(source.includes('/assets/social-card'+(language==='fr'?'':'-'+language)+'.jpg'));
            for(const code of ['fr','en','es','x-default']) assert.ok(source.includes('hreflang="'+code+'"'));
            const structured=JSON.parse(source.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
            assert.equal(structured['@graph'][0].inLanguage,language);
            assert.equal(structured['@graph'][0].url,canonical);
            for(const page of ['guide.html','privacy.html']) {
                const localized=await fs.readFile(path.join(directory,I.pageName(page,language)),'utf8');
                assert.match(localized,new RegExp('<html lang="'+language+'"'));
                assert.ok(localized.includes('href="'+I.pageName('home.html',language)+'"'));
            }
        }
        const sitemap=await fs.readFile(path.join(directory,'sitemap.xml'),'utf8');
        for(const page of ['en.html','es.html','guide.en.html','guide.es.html','privacy.en.html','privacy.es.html']) assert.ok(sitemap.includes(base+page));
    } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('the local companion serves the same language pages without exposing private files', async () => {
    const {createServer}=require('../server');
    const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    try {
        for(const [page,lang] of [['en.html','en'],['es.html','es'],['guide.en.html','en'],['privacy.es.html','es']]) {
            const response=await fetch(base+'/'+page);assert.equal(response.status,200);
            assert.match(await response.text(),new RegExp('<html lang="'+lang+'"'));
        }
        assert.equal((await fetch(base+'/i18n.js')).status,200);
        assert.equal((await fetch(base+'/server.es.html')).status,404);
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
