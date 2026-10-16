const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {build} = require('../scripts/build-public.cjs');
const {createServer} = require('../server');

const pages = ['', 'home.html', 'config.html', 'index.html', 'viewer.html', 'player.html',
    'guide.html', 'privacy.html', 'en.html', 'es.html', 'guide.en.html', 'guide.es.html',
    'privacy.en.html', 'privacy.es.html'];

// Follow the browser's resource URLs, including paths relative to nested stylesheets.
async function checkResources(base, entries, read) {
    const pending = entries.map(page => new URL(page, base));
    const visited = new Set();
    while(pending.length) {
        const url = pending.pop();
        if(url.origin !== base.origin) continue;
        url.hash = ''; url.search = '';
        if(visited.has(url.href)) continue;
        visited.add(url.href);
        assert.ok(url.pathname.startsWith(base.pathname), 'Resource left the site base: ' + url.href);
        const content = await read(url);
        assert.ok(content.length, 'Empty resource: ' + url.href);
        const references = [];
        if(url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
            for(const [tag] of content.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
                if(/^<link\b/i.test(tag) && !/\brel="(?:stylesheet|icon|shortcut icon|apple-touch-icon|manifest)"/i.test(tag)) continue;
                const match = /\b(?:src|href)="([^"]+)"/.exec(tag);
                if(match) references.push(match[1]);
            }
        } else if(url.pathname.endsWith('.css')) {
            for(const match of content.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) references.push(match[1]);
        } else if(url.pathname.endsWith('.webmanifest')) {
            references.push(...JSON.parse(content).icons.map(icon => icon.src));
        }
        pending.push(...references.map(reference => new URL(reference, url)));
    }
}

test('local and offline pages can load all scripts, styles, masks, images and manifest icons', async () => {
    const server = createServer({desktop: true});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = new URL('http://127.0.0.1:' + server.address().port + '/');
    try {
        await checkResources(base, [...pages, 'assets/social-card.html', 'assets/social-card.en.html', 'assets/social-card.es.html'], async url => {
            const response = await fetch(url);
            assert.equal(response.status, 200, 'Missing resource: ' + url.href);
            return response.text();
        });
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('the static bundle loads every page resource when hosted below a URL subdirectory', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openmultiview-site-'));
    const base = new URL('https://example.com/community/');
    try {
        await build({directory, publicURL: base.href});
        await checkResources(base, pages, url => fs.readFile(path.join(directory, url.pathname.slice(base.pathname.length) || 'index.html'), 'utf8'));
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
