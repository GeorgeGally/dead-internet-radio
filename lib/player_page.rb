require "digest"

# Serves the player page uncached, with a content hash on every local script,
# stylesheet and icon. Those files are cached for a year under their own URL, so a
# changed file gets a new URL and reaches returning browsers.
class PlayerPage
  PATHS = %w[/ /index.html].freeze
  ASSET = /\b(src|href)="(?![a-z]+:|\/\/)([^"?#]+\.(?:js|css|ico|svg|png|webmanifest))"/

  def initialize(app, public_path:, cache: true)
    @app = app
    @public_path = public_path
    @cache = cache
  end

  def call(env)
    return @app.call(env) unless PATHS.include?(env["PATH_INFO"]) && %w[GET HEAD].include?(env["REQUEST_METHOD"])

    html = page
    etag = %("#{Digest::SHA256.hexdigest(html)[0, 16]}")
    headers = { "content-type" => "text/html; charset=utf-8", "cache-control" => "no-cache", "etag" => etag }
    return [304, headers.except("content-type"), []] if env["HTTP_IF_NONE_MATCH"] == etag

    [200, headers, env["REQUEST_METHOD"] == "HEAD" ? [] : [html]]
  end

  private

  def page
    return @page ||= stamp if @cache

    stamp
  end

  def stamp
    File.read(File.join(@public_path, "index.html")).gsub(ASSET) do
      attribute = Regexp.last_match(1)
      asset = Regexp.last_match(2)
      file = File.join(@public_path, asset)
      next Regexp.last_match(0) unless File.file?(file)

      %(#{attribute}="#{asset}?v=#{Digest::SHA256.file(file).hexdigest[0, 10]}")
    end
  end
end
