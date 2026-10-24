require "net/http"

# Same-origin pass-through for Prelinger films on archive.org. Their storage
# hosts don't send CORS headers, so a cross-origin <video> either fails to load
# (crossOrigin set) or taints the canvas and every filter stops working.
# Only archive.org/download/<item>/<file>.mp4 is proxied; Range is forwarded so
# the browser can stream and seek.
class BrollController < ApplicationController
  include ActionController::Live

  ITEM = /\A[\w.\-]+\z/
  # Ad files are named like "1968 Easter Seals with Carol Burnett.mp4".
  FILE = %r{\A[^\0\\]+\.mp4\z}

  def show
    item = params[:item].to_s
    file = params[:file].to_s
    return head :bad_request unless item.match?(ITEM) && file.match?(FILE) && !file.include?("..")

    path = "#{item}/#{file.split('/').map { |s| ERB::Util.url_encode(s) }.join('/')}"
    # archive.org answers every request with a redirect to a storage host;
    # remember it so each Range request the <video> makes skips that hop.
    cached = Rails.cache.read("broll:#{path}")
    fetch(URI(cached || "https://archive.org/download/#{path}"), 4, path)
  ensure
    response.stream.close unless response.committed? && response.stream.closed?
  end

  private

  def fetch(uri, redirects, path)
    Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 30) do |http|
      req = Net::HTTP::Get.new(uri)
      req["Range"] = request.headers["Range"] if request.headers["Range"].present?
      http.request(req) do |res|
        if res.is_a?(Net::HTTPRedirection) && redirects.positive?
          Rails.cache.write("broll:#{path}", res["location"], expires_in: 30.minutes)
          return fetch(URI(res["location"]), redirects - 1, path)
        end

        response.status = res.code.to_i
        %w[Content-Type Content-Length Content-Range Accept-Ranges].each do |h|
          response.headers[h] = res[h] if res[h]
        end
        response.headers["Cache-Control"] = "public, max-age=86400"
        res.read_body { |chunk| response.stream.write(chunk) }
      end
    end
  rescue ActionController::Live::ClientDisconnected, IOError
    # Browser seeked or moved on; nothing to do.
  end
end
