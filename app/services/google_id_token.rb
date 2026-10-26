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

  USERINFO = "https://openidconnect.googleapis.com/v1/userinfo".freeze

  # The site's own sign-in button gets an access token from Google's popup
  # (Google's rendered button can't be styled). The token must have been
  # issued to our client; the profile comes from userinfo with it.
  def self.verify_access_token(token)
    return nil if client_id.nil? || token.blank?

    info = get_json(TOKENINFO, access_token: token)
    return nil unless info && info["aud"] == client_id && info["expires_in"].to_i > 0

    claims = get_json(USERINFO, {}, "Authorization" => "Bearer #{token}")
    return nil unless claims && claims["sub"].present? && claims["sub"] == info["sub"]
    return nil unless claims["email_verified"].to_s == "true"

    claims
  rescue StandardError => e
    Rails.logger.warn("google access token check failed: #{e.class}: #{e.message}")
    nil
  end

  def self.get_json(url, query = {}, headers = {})
    uri = URI(url)
    uri.query = URI.encode_www_form(query) if query.any?
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 5) { |http| http.get(uri.request_uri, headers) }
    res.is_a?(Net::HTTPSuccess) ? JSON.parse(res.body) : nil
  end
end
