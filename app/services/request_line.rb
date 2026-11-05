# The generation PC's end of the request line, called through dir-pc-gate. The
# PC keeps its own line on disk: this hands over what it hasn't seen and takes
# back how each request went. Marks repeat safely, the PC retries after a drop.
module RequestLine
  ON_THE_PC = %w[accepted queued generating].freeze

  # "<id> <render spec as JSON>", one line per request waiting for the PC.
  def self.waiting
    SongRequest.accepted.order(:id).includes(:user, :matched_track).map { |req| "#{req.id} #{req.render_spec.to_json}" }
  end

  def self.mark!(id, state, folder = nil)
    req = SongRequest.find_by(id: id)
    return unless req

    req.with_lock do
      next unless ON_THE_PC.include?(req.status)

      case state
      when "queued" then req.queued! if req.accepted?
      when "generating" then req.generating!
      when "failed" then req.failed!
      when "done" then air(req, folder)
      else raise ArgumentError, "no such state: #{state}"
      end
    end
  end

  # Sets are built by hand now, so a request goes on right after the current
  # song. The listener hears it soon and gets the time by email.
  def self.air(req, folder)
    track = Show.find_by!(directory: folder).tracks.ordered.last
    req.update!(status: :ready, track: track)
    RequestNotifier.scheduled!([Station.insert_next(track)])
  end
  private_class_method :air
end
