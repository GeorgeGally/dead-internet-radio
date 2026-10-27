# Once a set carrying a request is on the timeline, the listener gets one
# email with the time it airs.
module RequestNotifier
  def self.scheduled!(segments)
    by_song = segments.index_by { |seg| seg.track.song_id }
    SongRequest.ready.where(track_id: by_song.keys, notified_at: nil).includes(:user).find_each do |req|
      seg = by_song[req.track_id]
      req.update!(status: :scheduled, notified_at: Time.current)
      RequestMailer.scheduled(req, seg.starts_at).deliver_later if req.user.email.present?
    end
  end
end
