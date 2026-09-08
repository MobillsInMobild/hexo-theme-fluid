# Theme interaction regression tests

These tests run the actual browser scripts in jsdom with jQuery, Bootstrap and tocbot versions matching the blog. They cover search requests, literal technical keywords, ranking/pagination, Chinese input composition, loading errors, copy-handler reuse, readable title fallbacks, mobile TOC navigation/focus and Hexo localization.

Requires Node.js 20 or newer. For the Shiki integration tests, place this theme under a Hexo blog with shiki@4.4.2 and cheerio@1.0.0 installed in that blog (the maintained blog restores them with npm ci). From the theme repository:

```sh
npm ci --prefix tests
npm test --prefix tests
```

Browser-test dependencies are isolated under `tests`. Shiki integration tests additionally use the blog build dependencies.

For integration validation, run the blog's build command, inspect the full log for `ERROR` / `Render HTML failed` (Hexo can return exit code 0 despite render failures), and confirm generated HTML is nonempty. Check a real article at mobile and desktop widths, including opening/closing the TOC and navigating to a heading. Test rendering does not replace visual checks.
