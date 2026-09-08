'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const theme = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(theme, 'source/js', name), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function browser(html, config = {}) {
  const dom = new JSDOM(html, { url: 'https://blog.example/article/', runScripts: 'outside-only',
    pretendToBeVisual: true });
  const w = dom.window;
  w.jQuery = w.$ = require('jquery')(w);
  w.matchMedia = () => ({ matches: false });
  w.scrollTo = () => {};
  w.CONFIG = Object.assign({
    include_content_in_search: true,
    code_language: { enable: true, default: 'TEXT' },
    copy_btn: true,
    typing: { typeSpeed: 60, loop: false, cursorChar: '_' },
    toc: { expand_all: true, headingSelector: 'h1,h2,h3' }
  }, config);
  w.Fluid = { utils: {
    prefersReducedMotion: () => false,
    getBackgroundLightness: () => 1
  }, events: { registerRefreshCallback(callback) { this.refresh = callback; } } };
  return dom;
}

function searchBrowser(config) {
  const dom = browser('<div id="modalSearch"><input id="local-search-input">' +
    '<p id="local-search-status"></p><div id="local-search-result"></div></div>', config);
  const w = dom.window, $ = w.jQuery;
  const requests = [];
  $.ajax = options => {
    const deferred = $.Deferred();
    requests.push({ options, deferred });
    return deferred.promise();
  };
  w.eval(source('local-search.js'));
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    dom, w, $, requests,
    open() { $('#modalSearch').trigger('show.bs.modal'); },
    close() { $('#modalSearch').trigger('hidden.bs.modal'); },
    resolve(entries, index = requests.length - 1) {
      const xml = '<search>' + entries.map((e, i) => '<entry><title>' + escape(e.title) +
        '</title><content>' + escape(e.content || '') + '</content><url>' +
        escape(e.url || '/post-' + i) + '</url></entry>').join('') + '</search>';
      requests[index].deferred.resolve($.parseXML(xml));
    },
    async query(text) { $('#local-search-input').val(text).trigger('input'); await wait(210); },
    titles() { return $('.search-list-title').map((i, e) => e.textContent).get(); }
  };
}

test('search shares in-flight requests, caches parsed data and binds input once', async t => {
  const b = searchBrowser(); t.after(() => b.dom.window.close());
  b.open();
  b.$('#local-search-input').val('guide').trigger('input');
  b.close(); b.open();
  assert.equal(b.requests.length, 1);
  b.$('#local-search-input').val('guide');
  b.resolve([{ title: 'Guide' }]);
  assert.deepEqual(b.titles(), ['Guide']);
  for (let i = 0; i < 3; i++) { b.close(); b.open(); }
  b.w.eval(source('local-search.js'));
  await b.query('guide');
  assert.equal(b.requests.length, 1);
  assert.equal(b.$._data(b.$('#local-search-input')[0], 'events').input.length, 1);
  assert.deepEqual(b.titles(), ['Guide']);
});

test('search treats technical keywords literally and never injects result markup', async t => {
  const b = searchBrowser(); t.after(() => b.dom.window.close()); b.open();
  b.resolve([
    { title: 'C++ guide [array] a.b foo-bar', content: 'literal symbols' },
    { title: '<img src=x onerror=alert(1)> guide' },
    { title: 'guide', url: 'javascript:alert(1)' }
  ]);
  for (const word of ['C++', '[array]', 'a.b', 'foo-bar', '[']) {
    await b.query(word);
    assert.equal(b.titles().length, 1, word);
    assert.equal(b.$('.search-word').first().text(), word);
  }
  await b.query('img');
  assert.equal(b.$('#local-search-result img').length, 0);
  assert.ok(b.titles()[0].includes('<img'));
  await b.query('guide');
  assert.equal(b.titles().length, 2);
});

test('search ranks title matches first and paginates results without another request', async t => {
  const b = searchBrowser(); t.after(() => b.dom.window.close()); b.open();
  b.resolve([{ title: 'Unrelated title', content: 'guide' },
    ...Array.from({ length: 44 }, (_, i) => ({ title: 'Guide ' + i, content: 'guide text' }))]);
  await b.query('guide');
  assert.equal(b.titles().length, 20);
  assert.equal(b.titles()[0], 'Guide 0');
  assert.match(b.$('#local-search-status').text(), /45/);
  b.$('.search-more').trigger('click');
  assert.equal(b.titles().length, 40);
  b.$('.search-more').trigger('click');
  assert.equal(b.titles().length, 45);
  assert.equal(b.titles()[44], 'Unrelated title');
  assert.equal(b.$('.search-more').length, 0);
  assert.equal(b.requests.length, 1);
});

test('search supports title-only indexes, empty content, IME composition and debounce', async t => {
  const b = searchBrowser({ include_content_in_search: false });
  t.after(() => b.dom.window.close()); b.open();
  b.resolve([{ title: '数据库笔记' }, { title: 'Other', content: '数据库' }]);
  const input = b.$('#local-search-input');
  input.trigger('compositionstart').val('数据').trigger('input');
  await wait(210);
  assert.equal(b.titles().length, 0);
  input.val('数据库').trigger('compositionend');
  assert.deepEqual(b.titles(), ['数据库笔记']);
  input.val('Other').trigger('input');
  input.val('not found').trigger('input');
  assert.deepEqual(b.titles(), ['数据库笔记']);
  await wait(210);
  assert.equal(b.titles().length, 0);
  assert.match(b.$('#local-search-status').text(), /No matching/);
  await b.query('');
  assert.match(b.$('#local-search-status').text(), /Enter keywords/);
});

test('failed search can retry and late responses do not reopen a closed dialog', async t => {
  const b = searchBrowser(); t.after(() => b.dom.window.close()); b.open();
  b.requests[0].deferred.reject({}, 'timeout');
  assert.equal(b.$('.search-retry').length, 1);
  assert.equal(b.$('#local-search-result').attr('aria-busy'), 'false');
  b.$('.search-retry').trigger('click');
  assert.equal(b.requests.length, 2);
  b.close();
  b.resolve([{ title: 'Cached guide' }]);
  assert.equal(b.$('#local-search-result').text(), '');
  b.open(); await b.query('guide');
  assert.deepEqual(b.titles(), ['Cached guide']);
  assert.equal(b.requests.length, 2);
});

test('copy widgets initialize one delegated instance and survive refresh/new code blocks', t => {
  const dom = browser('<main class="markdown-body"><pre><code class="hljs js">const n = 1;</code></pre>' +
    '<pre><code class="hljs js">second block</code></pre><pre><code class="mermaid">graph TD</code></pre></main>');
  t.after(() => dom.window.close());
  const w = dom.window, instances = [];
  w.ClipboardJS = class {
    constructor(selector, options) { this.options = options; this.events = {}; instances.push(this); }
    on(name, callback) { this.events[name] = callback; }
  };
  w.eval(source('plugins.js'));
  w.Fluid.plugins.codeWidget(); w.Fluid.plugins.codeWidget();
  assert.equal(instances.length, 1);
  assert.equal(w.document.querySelectorAll('button.copy-btn').length, 2);
  w.jQuery('.markdown-body').append('<pre><code>new block</code></pre>');
  w.Fluid.plugins.codeWidget();
  assert.equal(instances.length, 1);
  assert.equal(w.document.querySelectorAll('button.copy-btn').length, 3);
  const button = w.document.querySelector('.copy-btn');
  assert.equal(instances[0].options.text(button), 'const n = 1;');
  instances[0].events.success({ trigger: button, clearSelection() {} });
  assert.equal(button.getAttribute('aria-label'), 'Copied');
  assert.equal(button.querySelector('.code-widget-label').textContent, 'JS');
  assert.equal(button.getAttribute('data-copy-state'), 'success');
  assert.equal(instances[0].options.text(button), 'const n = 1;');
  instances[0].events.error({ trigger: button });
  assert.match(w.document.querySelector('#code-copy-status').textContent, /Copy failed/);
  assert.equal(button.querySelector('.code-widget-label').textContent, 'JS');
  assert.equal(button.getAttribute('data-copy-state'), 'error');
  assert.equal(button.tagName, 'BUTTON');
});

test('typing preserves readable text when Typed is unavailable or reduced motion is requested', t => {
  const dom = browser('<span id="subtitle">Initial</span>'); t.after(() => dom.window.close());
  const w = dom.window; w.eval(source('plugins.js'));
  w.Fluid.plugins.typing('Readable title');
  assert.equal(w.document.querySelector('#subtitle').textContent, 'Readable title');
  w.Fluid.utils.prefersReducedMotion = () => true;
  w.Typed = class { constructor() { throw Error('Animation should not run'); } };
  w.Fluid.plugins.typing('Reduced motion title');
  assert.equal(w.document.querySelector('#subtitle').textContent, 'Reduced motion title');
});

function tocBrowser() {
  const dom = browser('<div id="navbar"></div><div id="board-ctn"><article class="markdown-body">' +
    '<h1 id="one">First chapter</h1><h2 id="two">Second chapter</h2><h3 id="three">Third</h3></article></div>' +
    '<aside id="toc-home"><div id="toc" data-toc-script="tocbot.js"><nav id="toc-body"></nav></div>' +
    '<button id="mobile-toc-toggle" hidden aria-expanded="false">Contents</button>' +
    '<div class="modal" id="mobile-toc-dialog" tabindex="-1"><div class="modal-dialog"><div class="modal-content">' +
    '<button data-dismiss="modal">Close</button><div class="modal-body"></div></div></div></div></aside>');
  const w = dom.window;
  w.innerWidth = 390;
  w.eval(fs.readFileSync(require.resolve('bootstrap/dist/js/bootstrap.js'), 'utf8'));
  w.eval(fs.readFileSync(require.resolve('tocbot/dist/tocbot.js'), 'utf8'));
  w.Fluid.utils.createScript = (url, callback) => callback();
  w.Fluid.utils.scrollToElement = (heading, offset) => { w.lastJump = { id: heading.id, offset }; };
  w.Fluid.utils.prefersReducedMotion = () => true;
  w.eval(source('toc.js'));
  return dom;
}

test('mobile TOC reuses one tree, restores desktop layout and jumps after closing', async t => {
  const dom = tocBrowser(); t.after(() => { dom.window.tocbot.destroy(); dom.window.close(); });
  const w = dom.window, $ = w.jQuery;
  assert.equal($('#toc-body .tocbot-link').length, 3);
  assert.equal($('#mobile-toc-toggle').prop('hidden'), false);
  $('#mobile-toc-toggle').trigger('click');
  assert.equal($('#toc').parent().hasClass('modal-body'), true);
  assert.equal($('#mobile-toc-toggle').attr('aria-expanded'), 'true');
  assert.equal(w.document.querySelectorAll('#toc-body').length, 1);
  $('#toc-body a[href="#two"]')[0].click();
  assert.equal($('#mobile-toc-dialog').hasClass('show'), false);
  assert.equal($('#toc').parent().attr('id'), 'toc-home');
  assert.equal(w.lastJump.id, 'two');
  assert.equal(w.location.hash, '#two');
  assert.equal(w.document.activeElement.id, 'two');
  $('#mobile-toc-toggle').trigger('click');
  w.innerWidth = 1200; $(w).trigger('resize');
  assert.equal($('#toc').parent().attr('id'), 'toc-home');
  assert.equal($('#mobile-toc-dialog').hasClass('show'), false);
  await wait(0);
});

test('TOC supports Escape, accessible collapse state, current location and refresh', async t => {
  const dom = tocBrowser(); t.after(() => { dom.window.tocbot.destroy(); dom.window.close(); });
  const w = dom.window, $ = w.jQuery;
  let toggle = $('#toc-body button.toc-toggle').first();
  assert.equal(toggle.attr('aria-expanded'), 'true');
  assert.ok(w.document.getElementById(toggle.attr('aria-controls')));
  toggle.trigger('click');
  assert.equal(toggle.attr('aria-expanded'), 'false');
  w.Fluid.events.refresh();
  toggle = $('#toc-body button.toc-toggle').first();
  assert.equal(toggle.attr('aria-expanded'), 'false');
  const second = $('#toc-body a[href="#two"]');
  $('#toc-body a').removeClass('tocbot-active-link');
  second.addClass('tocbot-active-link'); await wait(0);
  assert.equal(second.attr('aria-current'), 'location');
  $('#mobile-toc-toggle').trigger('click');
  $('#mobile-toc-dialog').trigger($.Event('keydown', { which: 27 }));
  assert.equal($('#mobile-toc-dialog').hasClass('show'), false);
  assert.equal(w.document.activeElement.id, 'mobile-toc-toggle');
});



test('exported browser config uses the standard URL API and preserves localized placeholders', () => {
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const I18n = require('hexo-i18n');
  const yaml = require('js-yaml');
  const helperPath = path.join(theme, 'scripts/helpers/export-config.js');
  let helper;
  vm.runInNewContext(fs.readFileSync(helperPath, 'utf8'), {
    require: createRequire(helperPath),
    hexo: { extend: { helper: { register(name, fn) { helper = fn; } } } }
  });
  const themeConfig = yaml.load(fs.readFileSync(path.join(theme, '_config.yml'), 'utf8'));
  for (const lang of ['en', 'zh-CN']) {
    const i18n = new I18n({ languages: [lang] });
    i18n.set(lang, yaml.load(fs.readFileSync(path.join(theme, 'languages', lang + '.yml'), 'utf8')));
    const html = helper.call({
      config: { url: 'https://blog.example', root: '/' },
      theme: themeConfig, fluid_version: 'test', __: i18n.__(lang)
    });
    assert.ok(html.includes('{count}'));
    assert.ok(!html.includes('%d'));
    assert.ok(html.includes(lang === 'zh-CN' ? '找到 {count} 篇文章' : '{count} matching articles'));
  }
  const hosts = [
    ['https://blog.example/docs/', 'blog.example'],
    ['http://localhost:4000/', 'localhost'],
    ['not a valid URL', 'not a valid URL']
  ];
  for (const [url, hostname] of hosts) {
    const html = helper.call({
      config: { url, root: '/' }, theme: themeConfig, fluid_version: 'test', __: key => key
    });
    assert.equal(JSON.parse(html.match(/var CONFIG = (.*);/)[1]).hostname, hostname);
  }
  assert.doesNotMatch(fs.readFileSync(helperPath, 'utf8'), /url\.parse/);
});

test('search keyboard navigation respects IME and moves native focus between input and results', async t => {
  const b = searchBrowser(); t.after(() => b.dom.window.close()); b.open();
  b.resolve([{title: 'Guide one'}, {title: 'Guide two'}]);
  await b.query('guide');
  const input = b.$('#local-search-input');
  input.trigger('focus').trigger(b.$.Event('keydown', {key: 'ArrowDown'}));
  assert.equal(b.w.document.activeElement, b.$('.search-list-title')[0]);
  b.$(b.w.document.activeElement).trigger(b.$.Event('keydown', {key: 'ArrowDown'}));
  assert.equal(b.w.document.activeElement, b.$('.search-list-title')[1]);
  b.$(b.w.document.activeElement).trigger(b.$.Event('keydown', {key: 'ArrowUp'}));
  b.$(b.w.document.activeElement).trigger(b.$.Event('keydown', {key: 'ArrowUp'}));
  assert.equal(b.w.document.activeElement, input[0]);
  input.trigger('compositionstart').trigger(b.$.Event('keydown', {key: 'ArrowDown'}));
  assert.equal(b.w.document.activeElement, input[0]);
  input.trigger('compositionend');
  await b.query('no result');
  input.trigger(b.$.Event('keydown', {key: 'ArrowDown'}));
  assert.equal(b.w.document.activeElement, input[0]);
});

test('Mermaid follows theme changes, preserves source and skips redundant refreshes', async t => {
  const dom = browser('<div class="mermaid">graph TD; A--&gt;B</div>');
  t.after(() => dom.window.close());
  const w=dom.window, calls=[]; let theme;
  w.Fluid.utils.listenDOMLoaded = fn => fn();
  w.mermaid = { initialize(options) { theme=options.theme; }, init(config,node) {
    calls.push({theme, source:node.textContent}); node.innerHTML='<svg></svg>';
  }};
  w.eval(source('mermaid.js')); w.Fluid.initMermaid({theme:'forest'}, true);
  await wait(20);
  assert.equal(calls[0].theme, 'forest');
  w.Fluid.events.refresh(); await wait(20); assert.equal(calls.length,1);
  w.document.documentElement.setAttribute('data-user-color-scheme','dark'); await wait(20);
  assert.equal(calls[1].theme,'dark');
  assert.equal(calls[1].source,'graph TD; A-->B');
  w.document.documentElement.setAttribute('data-user-color-scheme','light'); await wait(20);
  assert.equal(calls[2].theme,'forest');
  const node=w.document.createElement('div'); node.className='mermaid'; node.textContent='graph TD; C-->D';
  w.document.body.appendChild(node); w.Fluid.events.refresh(); await wait(20);
  assert.equal(calls.length,4);
});

test('Mermaid serializes async rendering and settles on the latest theme', async t => {
  const dom=browser('<div class="mermaid">graph TD; A--&gt;B</div>');
  t.after(() => dom.window.close()); const w=dom.window, calls=[]; let theme, active=0;
  w.Fluid.utils.listenDOMLoaded=fn=>fn();
  w.mermaid={initialize(o){theme=o.theme;}, async run({nodes}) {
    assert.equal(active++,0); calls.push(theme); await wait(25);
    nodes[0].innerHTML='<svg></svg>'; active--;
  }};
  w.eval(source('mermaid.js')); w.Fluid.initMermaid({},true);
  w.document.documentElement.setAttribute('data-user-color-scheme','dark');
  await wait(100); assert.deepEqual(calls,['default','dark']);
});

test('Mermaid opt-out preserves a fixed theme and rendering errors preserve source', async t => {
  const dom=browser('<div class="mermaid">invalid diagram</div>');
  t.after(() => dom.window.close()); const w=dom.window, themes=[];
  w.Fluid.utils.listenDOMLoaded=fn=>fn(); w.console.error=()=>{};
  w.mermaid={initialize(o){themes.push(o.theme);},init(){throw Error('invalid');}};
  w.eval(source('mermaid.js')); w.Fluid.initMermaid({theme:'neutral'},false);
  await wait(20); w.document.documentElement.setAttribute('data-user-color-scheme','dark');
  await wait(20); assert.equal(themes.length,2);
  assert.equal(themes[1],'neutral');
  assert.equal(w.document.querySelector('.mermaid').textContent,'invalid diagram');
});

test('Shiki renders dual palettes, preserves source, handles unknown languages and leaves Mermaid intact', async () => {
  let render;
  const hexo={config:{},theme:{config:{code:{highlight:{line_number:true}}}},extend:{filter:{register(name,fn,priority){
    assert.equal(name,'after_post_render'); assert.equal(priority,5); render=fn;
  }}}};
  require('../scripts/events/lib/shiki')(hexo);
  const page=await render({content:'<p>Before</p><pre><code class="language-js">const x = &quot;&lt;tag&gt;&quot;;\n\nconsole.log(x);\n</code></pre>' +
    '<pre><code class="unknown-language">&lt;script&gt;literal&lt;/script&gt;</code></pre>' +
    '<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre><p>After</p>'});
  const dom=new JSDOM(page.content); const d=dom.window.document;
  assert.equal(d.querySelectorAll('pre.shiki').length,2);
  assert.match(page.content,/--shiki-light/); assert.match(page.content,/--shiki-dark/);
  assert.equal(d.querySelector('pre.shiki code').textContent,'const x = "<tag>";\n\nconsole.log(x);\n');
  assert.equal(d.querySelector('pre.shiki code').querySelectorAll('.line').length,4);
  assert.equal(d.querySelector('code.mermaid').textContent,'graph TD; A-->B');
  assert.equal(d.querySelectorAll('script').length,0);
  assert.equal((await render(page)).content,page.content);
  dom.window.close();
});

test('Shiki copy widget retains language and copies code without line numbers or labels', t => {
  const dom=browser('<main class="markdown-body"><pre class="shiki" data-language="javascript"><code><span class="line">const n = 1;</span>\n<span class="line">n++;</span></code></pre></main>');
  t.after(()=>dom.window.close()); const w=dom.window; let clipboard;
  w.ClipboardJS=function(selector,options){clipboard=options;this.on=()=>{};};
  w.eval(source('plugins.js')); w.Fluid.plugins.codeWidget();
  const button=w.document.querySelector('.copy-btn'); assert.ok(button);
  assert.equal(button.querySelector('.code-widget-label').textContent,'JAVASCRIPT');
  assert.equal(clipboard.text(button),'const n = 1;\nn++;');
});
