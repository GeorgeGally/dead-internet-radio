# Social / Open Graph tags for the public player (injected into index.html).
class ShareMeta
  MARKER = "<!-- SHARE_META -->"
  SNIPPET = File.expand_path("../public/share-meta.snippet.html", __dir__).freeze

  TITLE = "Dead Internet Radio"
  DESCRIPTION = "An autonomous station of AI-written songs, DJ voiceovers, and generative visuals—broadcasting into the void."

  def self.default_origin
    ENV.fetch("APP_URL", "https://dead-internet-radio.com").delete_suffix("/")
  end

  def self.render(origin = default_origin)
    body = File.read(SNIPPET)
    body
      .gsub("__ORIGIN__", origin)
      .gsub("__TITLE__", escape(TITLE))
      .gsub("__DESCRIPTION__", escape(DESCRIPTION))
  end

  def self.inject(html, origin = default_origin)
    html.gsub(MARKER, render(origin))
  end

  def self.escape(text)
    text.to_s.gsub("&", "&amp;").gsub('"', "&quot;")
  end
  private_class_method :escape
end