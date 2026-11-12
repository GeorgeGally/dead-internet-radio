# Streams audio masters straight off disk. The DB stores a *link* (path);
# the canonical file lives in output/<dir>/ (tracks) or mixes/ (mixes).
# No blobs in the DB, no static public/ copies.
class MediaController < ApplicationController
  def track
    stream Track.find(params[:id]).audio_path
  end

  def voiceover
    stream Track.find(params[:id]).voiceover_path
  end

  def mix
    stream Show.find(params[:id]).mix_path
  end

  private

  # Serve the file with HTTP Range support so browser <audio> can seek.
  # Puma's default send_file returns the whole file (200) even for Range
  # requests, so partial content is handled explicitly here.
  def stream(path)
    return head :not_found unless path && File.exist?(path)

    size = File.size(path)
    response.headers["Accept-Ranges"] = "bytes"

    if (m = request.headers["Range"].to_s.match(/\Abytes=(\d+)-(\d*)\z/))
      first = m[1].to_i
      last  = m[2].present? ? m[2].to_i : size - 1
      last  = size - 1 if last >= size

      if first > last
        response.headers["Content-Range"] = "bytes */#{size}"
        return head :range_not_satisfiable
      end

      response.headers["Content-Range"] = "bytes #{first}-#{last}/#{size}"
      send_data IO.binread(path, last - first + 1, first),
                type: "audio/mpeg", disposition: "inline",
                status: :partial_content
    else
      send_file path, type: "audio/mpeg", disposition: "inline"
    end
  end
end
