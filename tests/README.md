# Theme interaction regression tests

These tests run the actual browser scripts in jsdom with jQuery, Bootstrap and tocbot versions matching the blog. They cover search requests, literal technical keywords, ranking/pagination, Chinese input composition, loading errors, copy-handler reuse, readable title fallbacks, mobile TOC navigation/focus and Hexo localization.

Requires Node.js 18 or newer. From the theme repository:

```sh
npm ci --prefix tests
npm test --prefix tests
```

Test dependencies are isolated under `tests` and are not needed for blog builds.

For integration validation, run the blog's build command, inspect the full log for `ERROR` / `Render HTML failed` (Hexo can return exit code 0 despite render failures), and confirm generated HTML is nonempty. Check a real article at mobile and desktop widths, including opening/closing the TOC and navigating to a heading. Test rendering does not replace visual checks.
