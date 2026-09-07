/* global hexo */

'use strict';

const url = require('url');
const urlJoin = require('../utils/url-join');

/**
 * Export theme config to js
 */
hexo.extend.helper.register('export_config', function () {
  let { config, theme, fluid_version } = this;
  const uiText = (key, fallback) => {
    const value = this.__(key);
    return value === key ? fallback : value;
  };
  const exportConfig = {
    ui: {
      search: {
        loading: uiText('search.loading', 'Loading search index…'),
        prompt: uiText('search.prompt', 'Enter keywords to search articles.'),
        error: uiText('search.error', 'Search could not load. Please try again.'),
        retry: uiText('search.retry', 'Retry'),
        empty: uiText('search.empty', 'No matching articles.'),
        count: uiText('search.count', '{count} matching articles'),
        more: uiText('search.more', 'Show more')
      },
      copy: uiText('code.copy', 'Copy code'),
      copied: uiText('code.copied', 'Copied'),
      copyFailed: uiText('code.failed', 'Copy failed; select the code and copy manually.'),
      tocExpand: uiText('post.toc_expand', 'Expand section'),
      tocCollapse: uiText('post.toc_collapse', 'Collapse section')
    },
    hostname: url.parse(config.url).hostname || config.url,
    root: config.root,
    version: fluid_version,
    typing: theme.fun_features.typing,
    anchorjs: theme.fun_features.anchorjs,
    progressbar: theme.fun_features.progressbar,
    code_language: theme.code.language,
    copy_btn: theme.code.copy_btn,
    image_caption: theme.post.image_caption,
    image_zoom: theme.post.image_zoom,
    toc: theme.post.toc,
    lazyload: theme.lazyload,
    web_analytics: theme.web_analytics,
    search_path: urlJoin(config.root, theme.search.path),
    include_content_in_search: theme.search.content,
  };
  return `<script id="fluid-configs">
    var Fluid = window.Fluid || {};
    Fluid.ctx = Object.assign({}, Fluid.ctx)
    var CONFIG = ${JSON.stringify(exportConfig)};

    if (CONFIG.web_analytics.follow_dnt) {
      var dntVal = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      Fluid.ctx.dnt = dntVal && (dntVal.startsWith('1') || dntVal.startsWith('yes') || dntVal.startsWith('on'));
    }
  </script>`;
});
