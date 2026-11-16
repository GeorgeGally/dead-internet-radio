const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function check(html, enabled) {
  assert.equal((html.match(/G-YRTK3L63H0/g) || []).length, enabled ? 2 : 0);
  assert.doesNotMatch(html, /GTM-5R26L4MQ|googletagmanager\.com\/ns\.html/);
  if (enabled) {
    assert.match(html, /<head>\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-YRTK3L63H0"><\/script>/);
    assert.match(html, /gtag\('js', new Date\(\)\);/);
    assert.match(html, /gtag\('config', 'G-YRTK3L63H0'\);/);
  }
}

test('GA4 appears once on production player pages and production static builds only', () => {
  const ruby = `require 'active_support/core_ext/object/blank'; require 'active_support/core_ext/hash/except'; require './lib/player_page'; page = PlayerPage.new(->(env) { [404, {}, []] }, public_path: './public', cache: false, google_tag: ARGV[0] == 'production'); print page.call({'PATH_INFO' => ARGV[1], 'REQUEST_METHOD' => 'GET'})[2].join`;
  for (const env of ['production', 'development', 'test']) {
    for (const route of ['/', '/index.html']) {
      check(execFileSync('bundle', ['exec', 'ruby', '-e', ruby, env, route], { cwd: root, encoding: 'utf8' }), env === 'production');
    }
    const python = `import build_site, tempfile, pathlib\nwith tempfile.TemporaryDirectory() as d:\n build_site.DIST_DIR = pathlib.Path(d)\n build_site._build_dist_static()\n print((build_site.DIST_DIR / 'index.html').read_text())`;
    check(execFileSync('python3', ['-c', python], { cwd: root, encoding: 'utf8', env: { ...process.env, RAILS_ENV: env }, maxBuffer: 5 * 1024 * 1024 }), env === 'production');
  }
});
