const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function check(html, enabled) {
  assert.equal((html.match(/GTM-5R26L4MQ/g) || []).length, enabled ? 2 : 0);
  if (enabled) {
    assert.match(html, /<head>\s*<!-- Google Tag Manager -->[\s\S]*'gtm.start'[\s\S]*j.async=true/);
    assert.match(html, /<body>\s*<!-- Google Tag Manager \(noscript\) -->\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-5R26L4MQ"/);
  }
}

test('GTM appears once on production player pages and production static builds only', () => {
  const ruby = `require 'active_support/core_ext/object/blank'; require 'active_support/core_ext/hash/except'; require './lib/player_page'; page = PlayerPage.new(->(env) { [404, {}, []] }, public_path: './public', cache: false, google_tag: ARGV[0] == 'production'); print page.call({'PATH_INFO' => ARGV[1], 'REQUEST_METHOD' => 'GET'})[2].join`;
  for (const env of ['production', 'development', 'test']) {
    for (const route of ['/', '/index.html']) {
      check(execFileSync('bundle', ['exec', 'ruby', '-e', ruby, env, route], { cwd: root, encoding: 'utf8' }), env === 'production');
    }
    const python = `import build_site, tempfile, pathlib\nwith tempfile.TemporaryDirectory() as d:\n build_site.DIST_DIR = pathlib.Path(d)\n build_site._build_dist_static()\n print((build_site.DIST_DIR / 'index.html').read_text())`;
    check(execFileSync('python3', ['-c', python], { cwd: root, encoding: 'utf8', env: { ...process.env, RAILS_ENV: env }, maxBuffer: 5 * 1024 * 1024 }), env === 'production');
  }
});
