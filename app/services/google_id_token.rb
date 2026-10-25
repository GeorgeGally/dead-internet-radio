require "net/http"

# Checks a Google Identity Services ID token with Google's tokeninfo endpoint.
# Returns the claims hash, or nil if the token isn't one Google issued to us.
module GoogleIdToken
  TOKENINFO = "https://oauth2.googleapis.com/tokeninfo".freeze
  ISSUERS = %w[accounts.google.com https://accounts.google.com].freeze

  def self.client_id
    ENV["GOOGLE_CLIENT_ID"].presence
  end

  def self.verify(token)
    return nil if client_id.nil? || token.blank?

    uri = URI(TOKENINFO)
    uri.query = URI.encode_www_form(id_token: token)
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 5) { |http| http.get(uri.request_uri) }
    return nil unless res.is_a?(Net::HTTPSuccess)

    claims = JSON.parse(res.body)
    return nil unless claims["aud"] == client_id
    return nil unless ISSUERS.include?(claims["iss"])
    return nil unless claims["email_verified"].to_s == "true"
    return nil unless claims["exp"].to_i > Time.current.to_i
    return nil if claims["sub"].blank?

    claims
  rescue StandardError => e
    Rails.logger.warn("google id token check failed: #{e.class}: #{e.message}")
    nil
  end
end
