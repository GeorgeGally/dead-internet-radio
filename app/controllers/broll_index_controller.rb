require "net/http"

# Film searches and file lists for the B-roll artwork. Listeners on a poor route
# to archive.org get resets or 40 s waits, which left the artwork with nothing
# to play, so the server asks and every listener shares the answer.
class BrollIndexController < ApplicationController
  ARCHIVE = "https://archive.org"
  ITEM = /\A[\w.\-]+\z/
  MAX_QUERY = 500
  MAX_ROWS = 20
  KEEP_FOR = 1.day

  def search
    query = params[:q].to_s
    return head :bad_request if query.empty? || query.length > MAX_QUERY

    rows = params[:rows].to_i.clamp(0, MAX_ROWS)
    page = params[:page].to_i.clamp(1, 500)
    answer "search:#{query}:#{rows}:#{page}" do
      url = URI("#{ARCHIVE}/advancedsearch.php")
      url.query = URI.encode_www_form(q: query, "fl[]": "identifier", rows: rows, page: page, output: "json")
      json = archive_json(url)
      { response: { numFound: json.dig("response", "numFound"), docs: json.dig("response", "docs") } }
    end
  end

  def metadata
    item = params[:item].to_s
    return head :bad_request unless item.match?(ITEM)

    answer "metadata:#{item}" do
      json = archive_json(URI("#{ARCHIVE}/metadata/#{item}"))
      { files: Array(json["files"]).select { |f| f["name"].to_s.match?(/\.mp4\z/i) }.map { |f| f.slice("name", "size", "height") } }
    end
  end

  private

  def answer(key, &block)
    body = Rails.cache.fetch("broll-index:#{Digest::SHA256.hexdigest(key)}", expires_in: KEEP_FOR, &block)
    expires_in KEEP_FOR, public: true
    render json: body
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, OpenSSL::SSL::SSLError, JSON::ParserError, RuntimeError
    no_store
    head :bad_gateway
  end

  def archive_json(url)
    res = Net::HTTP.start(url.host, url.port, use_ssl: true, open_timeout: 5, read_timeout: 15) { |http| http.get(url.request_uri) }
    raise "archive.org answered #{res.code}" unless res.is_a?(Net::HTTPSuccess)

    JSON.parse(res.body)
  end
end
