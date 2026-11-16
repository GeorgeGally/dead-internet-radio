require "digest"
require_relative "share_meta"

# Serves the player page uncached, with a content hash on every local script,
# stylesheet and icon. Those files are cached for a year under their own URL, so a
# changed file gets a new URL and reaches returning browsers.
class PlayerPage
  PATHS = %w[/ /index.html].freeze
  ASSET = /\b(src|href)="(?![a-z]+:|\/\/)([^"?#]+\.(?:js|css|ico|svg|png|webmanifest))"/

  def initialize(app, public_path:, cache: true, google_tag: false)
    @app = app
    @public_path = public_path
    @cache = cache
    @google_tag = google_tag
  end

  def call(env)
    return @app.call(env) unless PATHS.include?(env["PATH_INFO"]) && %w[GET HEAD].include?(env["REQUEST_METHOD"])

    html = page(env)
    etag = %("#{Digest::SHA256.hexdigest(html)[0, 16]}")
    headers = { "content-type" => "text/html; charset=utf-8", "cache-control" => "no-cache", "etag" => etag }
    return [304, headers.except("content-type"), []] if env["HTTP_IF_NONE_MATCH"] == etag

    [200, headers, env["REQUEST_METHOD"] == "HEAD" ? [] : [html]]
  end

  private

  def page(env)
    return @page ||= stamp(env) if @cache

    stamp(env)
  end

  def stamp(env)
    html = File.read(File.join(@public_path, "index.html")).gsub(ASSET) do
      attribute = Regexp.last_match(1)
      asset = Regexp.last_match(2)
      file = File.join(@public_path, asset)
      next Regexp.last_match(0) unless File.file?(file)

      %(#{attribute}="#{asset}?v=#{Digest::SHA256.file(file).hexdigest[0, 10]}")
    end
    if @google_tag
      html = html.sub("<head>", "<head>\n#{File.read(File.join(@public_path, 'gtm-head.snippet.html'))}")
      html = html.sub("<body>", "<body>\n#{File.read(File.join(@public_path, 'gtm-body.snippet.html'))}")
    end
    ShareMeta.inject(html, origin_for(env))
  end

  def origin_for(env)
    return ShareMeta.default_origin unless env

    host = env["HTTP_HOST"]
    return ShareMeta.default_origin if host.blank?

    scheme = env["HTTP_X_FORWARDED_PROTO"].presence || env["rack.url_scheme"] || "http"
    "#{scheme}://#{host}"
  end
end
