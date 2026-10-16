/* Run on the vMix PC: node server.js. No package installation required. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('./public/js/multiview-model');
const I = require('./public/js/i18n');
const {webRoot, publicFiles, localFiles} = require('./scripts/web-files.cjs');
const dataDir = process.env.MULTIVIEW_DATA_DIR || path.join(process.env.LOCALAPPDATA || require('node:os').homedir(), 'multiview-vmix');
const port = Number(process.env.MULTIVIEW_PORT || 8090);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json'};
const assets = new Set([...publicFiles, ...localFiles]);
const localizedPages = new Map(I.languages.filter(lang => lang !== 'fr').flatMap(lang => ['home.html','guide.html','privacy.html'].map(page => [I.pageName(page, lang), {page,lang}])));
for(const lang of ['en','es']) localizedPages.set('assets/social-card.' + lang + '.html', {page:'assets/social-card.html', lang});
const applicationParameters = ['Input', 'Inputs', 'Input2', 'Settings', 'MaskSettings', 'PC', 'Screen', 'Config', 'IP', 'Port'];
const writes = new Map();
function respond(res, status, data) {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(data));
}
function createServer({now = Date.now, desktop = false, publicOrigins = [...M.PUBLIC_ORIGINS, ...(process.env.MULTIVIEW_PUBLIC_ORIGINS || '').split(',').filter(Boolean)]} = {}) {
    const trustedOrigins = new Set(publicOrigins.map(value => {
        const url = new URL(value.trim());
        if(url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Les origines publiques doivent être des origines HTTPS sans chemin.');
        return url.origin;
    }));
    const presence = new Map();
    return http.createServer({maxHeaderSize: 128 * 1024}, async (req, res) => {
        try {
            const url = new URL(req.url, 'http://127.0.0.1:' + port);
            if(['/control-api', '/presence-api', '/companion-api'].includes(url.pathname)) {
                const origin = req.headers.origin;
                if(!M.isLoopbackURL('http://' + req.headers.host) || origin && !M.isLoopbackURL(origin) && !trustedOrigins.has(origin)) return respond(res, 403, {error: 'Origine refusée'});
                if(origin) {
                    res.setHeader('Access-Control-Allow-Origin', origin);
                    res.setHeader('Vary', 'Origin');
                }
                if(req.method === 'OPTIONS') {
                    if(req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
                    res.writeHead(204, {'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'});
                    res.end(); return;
                }
            }
            if(url.pathname === '/companion-api') {
                if(req.method !== 'GET') return respond(res, 405, {error: 'Méthode non autorisée'});
                return respond(res, 200, {application: 'OpenMultiview', version: require('./package.json').version});
            }
            if(url.pathname === '/presence-api') {
                const pc = url.searchParams.get('PC');
                if(!pc || pc.length > 80) return respond(res, 400, {error: 'PC invalide'});
                const sessions = presence.get(pc) || new Map();
                for(const [id, report] of sessions) if(now() - report.seenAt > 12000) sessions.delete(id);
                if(req.method === 'GET') return respond(res, 200, [...sessions.values()]);
                if(req.method !== 'POST') return respond(res, 405, {error: 'Méthode non autorisée'});
                if(!String(req.headers['content-type']).startsWith('application/json')) return respond(res, 415, {error: 'JSON requis'});
                let body = '';
                for await(const chunk of req) { body += chunk; if(body.length > 8192) return respond(res, 413, {error: 'Signal trop volumineux'}); }
                let report;
                try { report = JSON.parse(body); } catch (_) { return respond(res, 400, {error: 'Signal invalide'}); }
                if(!report || typeof report.session !== 'string' || !report.session || report.session.length > 100 || !Number.isInteger(report.screen) || report.screen < 1 || report.screen > M.MAX_SCREENS || !Number.isFinite(report.configUpdated)) return respond(res, 400, {error: 'Signal invalide'});
                if(report.closed) sessions.delete(report.session);
                else sessions.set(report.session, {session: report.session, screen: report.screen, configUpdated: report.configUpdated,
                    vmixConnected: report.vmixConnected === true, hasLayers: report.hasLayers === true, enabled: report.enabled === true, seenAt: now()});
                if(sessions.size) presence.set(pc, sessions); else presence.delete(pc);
                return respond(res, 200, {ok: true});
            }
            if(url.pathname === '/control-api') {
                const pc = url.searchParams.get('PC');
                if(!pc || pc.length > 80) return respond(res, 400, {error: 'PC invalide'});
                const file = path.join(dataDir, crypto.createHash('sha256').update(pc).digest('hex') + '.json');
                if(req.method === 'GET') {
                    try { return respond(res, 200, JSON.parse(await fs.readFile(file, 'utf8'))); }
                    catch(error) { if(error.code === 'ENOENT') return respond(res, 200, null); throw error; }
                }
                if(req.method === 'PUT') {
                    // Same-site pages and local development pages share this PC's bridge.
                    if(!String(req.headers['content-type']).startsWith('application/json')) return respond(res, 415, {error: 'JSON requis'});
                    let body = '';
                    for await(const chunk of req) {
                        body += chunk;
                        if(body.length > 1024 * 1024) return respond(res, 413, {error: 'Configuration trop volumineuse'});
                    }
                    let state;
                    try { state = M.validate(JSON.parse(body)); }
                    catch(error) { return respond(res, 400, {error: error.message}); }
                    if(state.pc !== pc || !Number.isFinite(state.updated)) return respond(res, 400, {error: 'PC ou date invalide'});
                    const pending = (writes.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
                        let current;
                        try { current = JSON.parse(await fs.readFile(file, 'utf8')); } catch(error) { if(error.code !== 'ENOENT') throw error; }
                        if(current && current.updated >= state.updated) return current;
                        await fs.mkdir(dataDir, {recursive: true});
                        const temporary = file + '.tmp';
                        await fs.writeFile(temporary, JSON.stringify(state), 'utf8');
                        await fs.rename(temporary, file);
                        return state;
                    });
                    writes.set(file, pending);
                    try { return respond(res, 200, await pending); }
                    finally { if(writes.get(file) === pending) writes.delete(file); }
                }
                return respond(res, 405, {error: 'Méthode non autorisée'});
            }
            if(req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, {error: 'Méthode non autorisée'});
            const appRoot = [...url.searchParams.keys()].some(key => applicationParameters.some(name => name.toLowerCase() === key.toLowerCase()));
            const name = url.pathname === '/' ? appRoot ? 'index.html' : 'home.html' : url.pathname === '/viewer.html' ? 'index.html' : url.pathname.slice(1);
            if(!assets.has(name) && !localizedPages.has(name)) return respond(res, 404, {error: 'Fichier introuvable'});
            const localized = localizedPages.get(name);
            let content = await fs.readFile(path.join(webRoot, localized ? localized.page : name));
            if(desktop && ['config.html', 'index.html'].includes(name)) content = Buffer.from(content.toString().replace(/<body(?=[\s>])/, '<body data-desktop="true"'));
            if(localized && localized.page === 'assets/social-card.html') content = I.localizeHTML(content.toString(), localized.lang);
            else if(localized || ['home.html','guide.html','privacy.html'].includes(name)) content = I.publicDocument(content.toString(), localized ? localized.page : name, localized ? localized.lang : 'fr', 'https://vincentberry.github.io/openmultiview/');
            const headers = {'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};
            if(['index.html', 'config.html', 'player.html'].includes(name)) headers['X-Robots-Tag'] = 'noindex, follow';
            res.writeHead(200, headers);
            res.end(req.method === 'HEAD' ? undefined : content);
        } catch(error) { console.error(error.message); respond(res, 500, {error: 'Erreur du serveur local'}); }
    });
}
if(require.main === module) {
    const server = createServer();
    server.on('error', error => { console.error('Impossible de démarrer : ' + error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log('Configuration multiview : http://127.0.0.1:' + port + '/config.html\nSauvegardes PC : ' + dataDir));
}
module.exports = {createServer};
