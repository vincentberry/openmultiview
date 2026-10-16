/* Shared translation layer for the static build and the browser UI. */
(function(root) {
    'use strict';
    const catalog = typeof module !== 'undefined' ? require('./locales.js') : root.OpenMultiviewLocales;
    if(typeof module !== 'undefined') { require('./locales-studio.js'); require('./locales-docs.js'); }
    const languages = ['fr', 'en', 'es'];
    const valid = value => languages.includes(value) ? value : 'fr';
    const rows = new Map();
    for(const row of catalog.text) for(const text of row) if(!rows.has(text)) rows.set(text, row);
    function translate(value, language = 'fr') {
        const index = languages.indexOf(valid(language));
        const text = String(value), trimmed = text.trim();
        const exact = rows.get(trimmed);
        if(exact) return text.replace(trimmed, exact[index]);
        for(const [pattern, en, es] of catalog.patterns) {
            const regex = new RegExp('^' + pattern + '$');
            if(regex.test(trimmed)) return index ? text.replace(trimmed, trimmed.replace(regex, index === 1 ? en : es)) : text;
        }
        return text;
    }
    function pageName(name, language) {
        const lang = valid(language);
        const family = /^(guide|privacy)(?:\.(?:en|es))?\.html$/.exec(name);
        return family ? family[1] + (lang === 'fr' ? '' : '.' + lang) + '.html' : lang === 'fr' ? 'home.html' : lang + '.html';
    }
    function localizeHTML(source, language) {
        const lang = valid(language);
        let skip = false;
        let html = source.replace(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g, token => {
            if(token.startsWith('<!--')) return token;
            if(/^<(script|style|code)\b/i.test(token)) { skip = true; return token; }
            if(/^<\/(script|style|code)>/i.test(token)) { skip = false; return token; }
            if(skip) return token;
            if(token.startsWith('<')) return token.replace(/(aria-label|placeholder|content|title)="([^"]*)"/g, (_, key, value) => key + '="' + translate(value, lang).replaceAll('"', '&quot;') + '"');
            return translate(token.replaceAll('&amp;', '&'), lang).replaceAll('&', '&amp;');
        }).replace(/<html lang="[^"]+"/, '<html lang="' + lang + '"');
        html = html.replace(/href="(home|guide|privacy)\.html"/g, (_, name) => 'href="' + pageName(name + '.html', lang) + '"');
        html = html.replace(/href="config\.html"/g, 'href="config.html' + (lang === 'fr' ? '' : '?Lang=' + lang) + '"');
        html = html.replace(/"inLanguage":"fr"/g, '"inLanguage":"' + lang + '"').replace(/content="fr_FR"/g, 'content="' + ({fr:'fr_FR', en:'en_US', es:'es_ES'}[lang]) + '"');
        return html;
    }
    function publicDocument(source, page, language, base) {
        const lang = valid(language);
        let html = localizeHTML(source, lang);
        const family = /^(guide|privacy)\.html$/.exec(page);
        const route = value => family ? pageName(page, value) : value === 'fr' ? '' : value + '.html';
        const canonical = new URL(route(lang), base).href;
        html = html.replace(/(<link rel="canonical" href=")[^"]+/, '$1' + canonical);
        html = html.replace(/(<meta property="og:url" content=")[^"]+/, '$1' + canonical);
        if(lang !== 'fr') html = html.replaceAll('/assets/social-card.jpg', '/assets/social-card-' + lang + '.jpg');
        const alternates = [...languages.map(value => '<link rel="alternate" hreflang="' + value + '" href="' + new URL(route(value), base).href + '">'), '<link rel="alternate" hreflang="x-default" href="' + new URL(route('fr'), base).href + '">'].join('\n');
        html = html.replace('</head>', alternates + '\n</head>');
        html = html.replace(/(<script type="application\/ld\+json">)([^<]+)(<\/script>)/, (_, start, data, end) => {
            const graph = JSON.parse(data);
            for(const item of graph['@graph'] || []) {
                if(item.url) item.url = canonical;
                if(item.inLanguage) item.inLanguage = lang;
                if(item.description) item.description = translate(item.description, lang);
            }
            return start + JSON.stringify(graph) + end;
        });
        if(lang !== 'fr') html = html.replaceAll('http://127.0.0.1:8090/config.html"', 'http://127.0.0.1:8090/config.html?Lang=' + lang + '"');
        return html;
    }
    const api = {translate, valid, languages, pageName, localizeHTML, publicDocument, catalog};
    if(typeof module !== 'undefined') { module.exports = api; return; }
    root.OpenMultiviewI18n = api;
    let current = 'fr';
    try { current = valid(new URLSearchParams(location.search).get('Lang') || (document.documentElement.lang !== 'fr' ? document.documentElement.lang : localStorage.getItem('openmultiview.language'))); } catch (_) {}
    api.language = () => current;
    const textSources = new WeakMap(), attributes = new WeakMap();
    let observer;
    const skipSelector = 'script,style,code,pre,.inputTitle,.layerMediaTitle,#title_player,.source-choice strong,[data-source-name],#savedPresets option:not([value=""]),[data-i18n-skip]';
    function apply() {
        if(!document.body) return;
        if(observer) observer.disconnect();
        document.documentElement.lang = current;
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while(walk.nextNode()) {
            const node = walk.currentNode;
            if(!node.parentElement || node.parentElement.closest(skipSelector)) continue;
            let entry = textSources.get(node);
            if(!entry || entry.last !== node.nodeValue) entry = {source: node.nodeValue};
            entry.last = translate(entry.source, current);
            if(entry.last !== node.nodeValue) node.nodeValue = entry.last;
            textSources.set(node, entry);
        }
        for(const element of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')) {
            if(element.closest(skipSelector)) continue;
            const values = attributes.get(element) || {};
            for(const name of ['aria-label','placeholder','title','alt']) {
                if(!element.hasAttribute(name)) continue;
                const value = element.getAttribute(name);
                if(!values[name] || values[name].last !== value) values[name] = {source: value};
                values[name].last = translate(values[name].source, current);
                if(values[name].last !== value) element.setAttribute(name, values[name].last);
            }
            attributes.set(element, values);
        }
        document.title = translate(document.title, current);
        for(const link of document.querySelectorAll('a[href]')) {
            const href = link.getAttribute('href');
            const match = /^((?:home|guide|privacy)(?:\.(?:en|es))?\.html|(?:en|es)\.html)(#.*)?$/.exec(href);
            if(match) {
                const target = pageName(match[1], current) + (match[2] || '');
                if(target !== href) link.setAttribute('href', target);
            }
        }
        const select = document.getElementById('languageSelect');
        if(select) select.value = current;
        if(observer) observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['aria-label','placeholder','title','alt']});
    }
    api.apply = apply;
    function init() {
        if(document.querySelector('.site-header') && current !== document.documentElement.lang) {
            location.replace(new URL(pageName(location.pathname.split('/').pop(), current), location.href).href);
            return;
        }
        try { localStorage.setItem('openmultiview.language', current); } catch (_) {}
        const target = document.querySelector('.site-header nav') || document.querySelector('.studio-header-tools');
        if(target) {
            const label = document.createElement('label');
            label.className = 'language-control';
            label.innerHTML = '<span class="language-label">Langue</span><select id="languageSelect" aria-label="Langue"><option value="fr" data-i18n-skip>Français</option><option value="en" data-i18n-skip>English</option><option value="es" data-i18n-skip>Español</option></select>';
            target.append(label);
            label.querySelector('select').addEventListener('change', event => {
                current = valid(event.target.value);
                try { localStorage.setItem('openmultiview.language', current); } catch (_) {}
                if(document.querySelector('.site-header')) {
                    const url = new URL(pageName(location.pathname.split('/').pop(), current), location.href);
                    url.hash = location.hash;
                    location.assign(url.href);
                    return;
                }
                apply();
                window.dispatchEvent(new CustomEvent('openmultiview-language'));
            });
        }
        observer = new MutationObserver(apply);
        apply();
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})(typeof window === 'undefined' ? globalThis : window);
