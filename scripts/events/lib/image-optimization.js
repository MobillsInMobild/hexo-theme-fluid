'use strict';

const { load } = require('cheerio');

const isLocalImage = (src) => src
  && !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src)
  && !/^data:/i.test(src);

const edgeoneUrl = (src, width, format) => {
  const hashIndex = src.indexOf('#');
  const base = hashIndex === -1 ? src : src.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : src.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}eo-img.resize=w/${width}${format ? `&eo-img.format=${format}` : ''}${hash}`;
};

module.exports = (hexo) => {
  const edgeone = hexo.theme.config.image_optimization
    && hexo.theme.config.image_optimization.edgeone;
  if (!edgeone || !edgeone.enable || !Array.isArray(edgeone.content_widths) || !edgeone.content_widths.length) {
    return;
  }

  hexo.extend.filter.register('after_post_render', (page) => {
    if (page.layout !== 'post' || !page.content) return page;
    const $ = load(page.content, null, false);
    $('img').each((_, image) => {
      const $image = $(image);
      const src = $image.attr('src');
      if (!isLocalImage(src) || $image.attr('srcset') || $image.attr('data-fluid-srcset')) return;
      const srcset = edgeone.content_widths
        .map(width => `${edgeoneUrl(src, width, edgeone.format)} ${width}w`)
        .join(', ');
      // Keep the original only for the zoom viewer. A rendered <img> must not
      // fall back to the full-size source before its responsive srcset is restored.
      $image.attr('data-fluid-original', src);
      $image.attr('src', edgeoneUrl(src, edgeone.content_widths[0], edgeone.format));
      $image.attr('data-fluid-srcset', srcset);
      $image.attr('sizes', '(max-width: 767px) calc(100vw - 30px), 840px');
    });
    page.content = $.html();
    return page;
  }, 9);
};
