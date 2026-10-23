# The station clock. Keeps the broadcast timeline filled ahead of "now" by
# rotating through completed shows (one whole show at a time, so DJ drops
# stay in order), and lets requests jump the queue.
class Station
  HORIZON = 1.hour
  LOCK_KEY = 0x0D1A  # pg advisory lock id for timeline writes

  # Current segment first, then what's coming.
  def self.lineup(at: Time.current, limit: 6)
    fill!(at)
    BroadcastSegment.upcoming(at).includes(track: :show).limit(limit)
  end

  # Slot a track in right after whatever is on air, pushing the rest back.
  def self.insert_next(track, source: "request", at: Time.current)
    duration = track.duration_ms.to_i / 1000.0
    locked do
      current = BroadcastSegment.upcoming(at).first
      start = current ? current.ends_at : at
      BroadcastSegment.where("starts_at >= ?", start)
        .update_all(["starts_at = starts_at + make_interval(secs => ?), ends_at = ends_at + make_interval(secs => ?)", duration, duration])
      BroadcastSegment.create!(track: track, source: source, starts_at: start, ends_at: start + duration)
    end
  end

  def self.fill!(at = Time.current)
    return if BroadcastSegment.where("ends_at > ?", at + HORIZON).exists?

    locked do
      last = BroadcastSegment.chronological.last
      # Dead air (server was off): restart the timeline at now.
      cursor = last && last.ends_at > at ? last.ends_at : at

      while cursor < at + HORIZON
        tracks = next_show_tracks
        break if tracks.empty?
        tracks.each do |track|
          ends = cursor + track.duration_ms / 1000.0
          BroadcastSegment.create!(track: track, starts_at: cursor, ends_at: ends)
          cursor = ends
        end
      end
    end
  end

  # Least-recently-aired completed show with playable tracks.
  def self.next_show_tracks
    last_aired = BroadcastSegment.joins(:track).group("tracks.show_id").maximum(:starts_at)
    shows = Show.completed.includes(:tracks).sort_by { |s| [last_aired[s.id] || Time.at(0), s.id] }
    shows.each do |show|
      tracks = show.tracks.ordered.select { |t| t.duration_ms.to_i > 0 && t.audio_path && File.exist?(t.audio_path) }
      return tracks if tracks.any?
    end
    []
  end

  def self.locked
    BroadcastSegment.transaction do
      BroadcastSegment.connection.execute("SELECT pg_advisory_xact_lock(#{LOCK_KEY})")
      yield
    end
  end
  private_class_method :next_show_tracks, :locked
end
