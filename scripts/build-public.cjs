/* Build a static, deployable site without publishing the companion or local data. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const M = require('../multiview-model');
const I = require('../i18n');
const root = path.resolve(__dirname, '..');
const defaultURL = 'https://vincentberry.github.io/openmultiview/';
const publicFiles = ['home.html', 'guide.html', 'privacy.html', 'site.css', 'site.js', 'site.webmanifest', 'robots.txt', 'sitemap.xml', 'i18n.js', 'locales.js', 'locales-studio.js', 'locales-docs.js',
    'config.html', 'config.css', 'player.html', 'style_player.css', 'script_player.js', 'style.css', 'studio.css', 'script.js', 'studio.js',
    'multiview-model.js', 'multiview-builder.js', 'jquery.js', 'favicon.ico', 'loop.png', 'mask.png', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'assets/openmultiview-icon.png', 'assets/openmultiview-logo.png', 'assets/social-card.jpg', 'assets/social-card-en.jpg', 'assets/social-card-es.jpg'];
async function build({directory = path.join(root, 'dist'), publicURL = process.env.PUBLIC_URL || defaultURL} = {}) {
    const url = new URL(publicURL);
    if(url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('PUBLIC_URL must be an HTTPS site URL, without query or credentials.');
    const base = url.href.replace(/\/?$/, '/');
    directory = path.resolve(directory);
    const defaultOutput = path.join(root, 'dist');
    const testOutput = path.join(os.tmpdir(), 'openmultiview-site-');
    if(directory !== defaultOutput && !directory.startsWith(testOutput)) throw new Error('The public build can only replace dist/ or an isolated test directory.');
    // A fresh output prevents files from older builds or local copies leaking.
    await fs.rm(directory, {recursive: true, force: true});
    await fs.mkdir(directory, {recursive: true});
    for(const name of publicFiles) {
        const destination = path.join(directory, name);
        await fs.mkdir(path.dirname(destination), {recursive: true});
        if(/\.(html|txt|xml)$/.test(name)) {
            const source = await fs.readFile(path.join(root, name), 'utf8');
            await fs.writeFile(destination, source.replaceAll(defaultURL, base));
        } else if(name === 'multiview-model.js') {
            const source = await fs.readFile(path.join(root, name), 'utf8');
            const origins = [...new Set([...M.PUBLIC_ORIGINS, url.origin])];
            await fs.writeFile(destination, source.replace(/const PUBLIC_ORIGINS = \[[^\n]+\];/, 'const PUBLIC_ORIGINS = ' + JSON.stringify(origins) + ';'));
        } else await fs.copyFile(path.join(root, name), destination);
    }
    await fs.copyFile(path.join(root, 'index.html'), path.join(directory, 'viewer.html'));
    for(const page of ['home.html','guide.html','privacy.html']) {
        const source = (await fs.readFile(path.join(root, page), 'utf8')).replaceAll(defaultURL, base);
        for(const language of I.languages) {
            const name = language === 'fr' ? page : I.pageName(page, language);
            await fs.writeFile(path.join(directory, name), I.publicDocument(source, page, language, base));
        }
    }
    await fs.copyFile(path.join(directory, 'home.html'), path.join(directory, 'index.html'));
    const sitemapPages = ['','en.html','es.html','guide.html','guide.en.html','guide.es.html','privacy.html','privacy.en.html','privacy.es.html'];
    await fs.writeFile(path.join(directory, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemapPages.map(page => '  <url><loc>' + new URL(page, base).href + '</loc></url>').join('\n') + '\n</urlset>\n');
    await fs.writeFile(path.join(directory, '.nojekyll'), '');
    return {directory, publicURL: base};
}
if(require.main === module) build().then(result => console.log('Public site: ' + result.directory + '\nCanonical URL: ' + result.publicURL)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {build, publicFiles};
