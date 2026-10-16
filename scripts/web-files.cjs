/* Shared allowlist for the local server, static website and offline package. */
const path = require('node:path');
const webRoot = path.resolve(__dirname, '../public');
const publicFiles = [
    'home.html', 'guide.html', 'privacy.html', 'config.html', 'player.html',
    'site.webmanifest', 'robots.txt', 'sitemap.xml', 'favicon.ico',
    'css/site.css', 'css/config.css', 'css/viewer.css', 'css/viewer-settings.css', 'css/player.css',
    'js/site.js', 'js/config.js', 'js/viewer.js', 'js/player.js', 'js/connection.js',
    'js/multiview-model.js', 'js/multiview-builder.js', 'js/i18n.js',
    'js/locales.js', 'js/locales-studio.js', 'js/locales-docs.js', 'vendor/jquery.js',
    'assets/loop.png', 'assets/mask.png', 'assets/openmultiview-icon.png',
    'assets/openmultiview-logo.png', 'assets/social-card.jpg',
    'assets/social-card-en.jpg', 'assets/social-card-es.jpg'
];
// The public build generates index.html from home.html and viewer.html from this overlay.
const localFiles = ['index.html', 'assets/social-card.html'];
const noticeFiles = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];
module.exports = {webRoot, publicFiles, localFiles, noticeFiles};
