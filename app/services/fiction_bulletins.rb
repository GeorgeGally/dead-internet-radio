require "net/http"

# DIR FICTION bulletins, written fresh by OpenRouter's free router and cached.
# Listeners always get an instant answer: the cache, or the hand-written lines.
module FictionBulletins
  PREFIX = "DIR FICTION / ".freeze
  CACHE_KEY = "signal/fiction-bulletins".freeze
  LOCK_KEY = "signal/fiction-bulletins/refreshing".freeze
  FRESH_FOR = 20.minutes
  MAX_LENGTH = 140
  BATCH = 6
  MODEL = "openrouter/free".freeze
  FALLBACK = [
    "Radiation will be heavy over the western sector this afternoon. Don’t forget those hazmats!",
    "Municipal servers advise residents to ignore the second moon.",
    "Signal contamination detected near Sector 9. Reception may improve.",
    "The last functioning vending machine has entered sleep mode.",
    "Residents are reminded that the fog is not accepting new followers.",
    "The bridge to Sector 4 is closed for buffering. Expect delays of one to forty years.",
    "Lost: one password, last seen in 2009. Answers to \"password1\".",
    "Pollen count is low. Packet loss is high. Dress accordingly.",
    "The council confirms the sky has been updated. No restart is required.",
    "Please do not feed the abandoned chatbots. They are learning.",
    "Water supply restored to the eastern districts. Taste may include advertising.",
    "A light drizzle of expired cookies is expected after midnight.",
    "The public library has archived itself. Opening hours are unknown.",
    "Curfew remains in effect for unverified accounts. Stay indoors and stay human.",
    "The comment section north of the river has been cordoned off. Do not engage.",
    "Tonight’s blackout is sponsored. Thank you for your continued attention."
  ].map { |line| PREFIX + line }.freeze
  PROMPT = <<~PROMPT.freeze
    You write fictional public-safety bulletins for Dead Internet Radio, a station
    broadcasting after the internet died and the humans mostly left. The voice is
    a dry, deadpan municipal announcer for a post-human city run by servers, bots
    and abandoned platforms. Each bulletin is one sentence or two, under #{MAX_LENGTH}
    characters, plain text, no hashtags, no emoji, no links, no real people or brands.
    Examples:
    #{FALLBACK.first(4).map { |l| "- #{l.delete_prefix(PREFIX)}" }.join("\n")}
    Write #{BATCH} new ones. Respond with exactly one JSON object: {"lines":["...","..."]}
  PROMPT

  # Development jobs run in a separate worker process, so the lines live on disk there.
  def self.store
    return Rails.cache unless Rails.env.development?

    @store ||= ActiveSupport::Cache::FileStore.new(Rails.root.join("tmp/cache/fiction-bulletins"))
  end

  # Never waits on a model: serves what is cached and refreshes stale lines in the background.
  def self.current
    cached = store.read(CACHE_KEY)
    if cached.nil? || cached[:at] < FRESH_FOR.ago
      if store.write(LOCK_KEY, true, expires_in: 5.minutes, unless_exist: true)
        RefreshFictionBulletinsJob.perform_later
      end
    end
    cached&.dig(:lines).presence || FALLBACK
  end

  # A failed refresh keeps serving the old lines; the lock's expiry spaces out retries.
  def self.refresh!
    lines = generate
    store.write(CACHE_KEY, { at: Time.current, lines: lines }) if lines.any?
    lines
  end

  def self.generate
    key = ENV["OPENROUTER_API_KEY"].presence
    return [] unless key

    parse(complete(key))
  rescue StandardError => e
    Rails.logger.warn("Fiction bulletins via #{MODEL} failed: #{e.class}")
    []
  end

  def self.complete(key)
    uri = URI(RequestFilter::OPENROUTER_URL)
    body = { model: MODEL, max_tokens: 900, temperature: 1.0,
      response_format: { type: "json_object" },
      messages: [ { role: "user", content: PROMPT } ] }
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 40) do |http|
      http.post(uri.path, body.to_json, "Authorization" => "Bearer #{key}", "Content-Type" => "application/json")
    end
    raise "HTTP #{res.code}" unless res.is_a?(Net::HTTPSuccess)

    JSON.parse(res.body).dig("choices", 0, "message", "content").to_s
  end

  def self.parse(content)
    json = content.to_s.gsub(/```(?:json)?/i, "")[/\{.*\}/m]
    raw = json ? Array(JSON.parse(json)["lines"]) : []
    raw.grep(String).filter_map { |line| clean(line) }.uniq.first(BATCH)
  rescue JSON::ParserError
    []
  end

  # One plain line in the station's format, or nothing.
  def self.clean(line)
    text = line.gsub(/[\r\n\t]+/, " ").delete("*_`#<>[]{}").squeeze(" ").strip
    text = text.delete_prefix("-").strip.sub(/\ADIR FICTION\s*\/\s*/i, "")
    return if text.length < 12 || text.length > MAX_LENGTH
    return if text.match?(%r{https?:|www\.|@\w}i) || RequestFilter.blocked?(text)

    PREFIX + text
  end
end
