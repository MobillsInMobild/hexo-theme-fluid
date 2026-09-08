'use strict';
const { pathToFileURL } = require('url');

module.exports = hexo => {
  const { load } = require('cheerio');
  hexo.config.highlight = Object.assign({}, hexo.config.highlight, { enable: false });
  hexo.config.prismjs = Object.assign({}, hexo.config.prismjs, { enable: false });
  hexo.config.syntax_highlighter = '';
  hexo.config.markdown_it_plus = Object.assign({}, hexo.config.markdown_it_plus, { highlight: false });
  if (hexo._fluidShiki) return;
  hexo._fluidShiki = true;
  const config = hexo.theme.config.code.highlight;
  const settings = config.shiki || {};
  const themes = { light: settings.theme || 'github-light', dark: settings.theme_dark || 'github-dark' };
  let engine;
  const languages = new Map();
  async function highlighter() {
    if (!engine) engine = import(pathToFileURL(require.resolve('shiki')).href).then(async shiki => ({
      shiki, instance: await shiki.createHighlighter({ themes: Object.values(themes), langs: [] })
    }));
    return engine;
  }
  // Run before encryption, preserving the existing Markdown renderer and its extensions.
  hexo.extend.filter.register('after_post_render', async page => {
    const html = page.content || '';
    const blocks = [...html.matchAll(/<pre\b[^>]*>\s*<code\b[^>]*>[\s\S]*?<\/code>\s*<\/pre>/gi)];
    if (!blocks.length) return page;
    const { shiki, instance } = await highlighter();
    let output = '', cursor = 0;
    for (const block of blocks) {
      const $ = load(block[0], null, false);
      const pre = $('pre'), code = pre.children('code');
      output += html.slice(cursor, block.index);
      cursor = block.index + block[0].length;
      if (pre.hasClass('shiki') || !code.length) { output += block[0]; continue; }
      const classes = (code.attr('class') || '').split(/\s+/).filter(Boolean);
      let lang = (classes.find(c => /^(language-|lang-)/.test(c)) || classes.find(c => c !== 'hljs') || 'text')
        .replace(/^(language-|lang-)/, '').toLowerCase();
      if (lang === 'mermaid') {
        code.addClass('mermaid'); output += $.html(); continue;
      }
      const label = lang;
      if (!Object.prototype.hasOwnProperty.call(shiki.bundledLanguages, lang)) lang = 'text';
      if (lang !== 'text') {
        if (!languages.has(lang)) languages.set(lang, instance.loadLanguage(lang));
        await languages.get(lang);
      }
      const highlighted = instance.codeToHtml(code.text(), {
        lang, themes, defaultColor: false,
        transformers: [{ pre(node) {
          node.properties['data-language'] = label;
          if (config.line_number) node.properties.class += ' shiki-line-numbers';
        }}]
      });
      output += '<div class="code-wrapper">' + highlighted + '</div>';
    }
    page.content = output + html.slice(cursor);
    return page;
  }, 5);
};
