# The station clock. Keeps the broadcast timeline filled ahead of "now" by
# rotating through completed shows and library sets (one whole show at a time,
# so DJ drops stay in order), with one station ID at each change of show. Planned
# hours ahead so a listener whose request lands in a set can be told when it airs.
class Station
  HORIZON = ENV.fetch("STATION_HORIZON_HOURS", "6").to_f.hours
  LOCK_KEY = 0x0D1A  # pg advisory lock id for timeline writes

  # Current segment first, then what's coming.
  def self.lineup(at: Time.current, limit: 6)
    fill!(at)
    BroadcastSegment.upcoming(at).includes(track: :show).limit(limit)
  end

  # The set on air, first segment to last: the unbroken run around now that
  # belongs to one show, with any requests slotted into it. A station ID on air
  # leads into the set after it; older airings of the same show are not part
  # of this run.
  def self.airing(at: Time.current)
    fill!(at)
    window = BroadcastSegment.where(starts_at: (at - AIRING_REACH)..(at + AIRING_REACH))
      .chronological.includes(track: :show).to_a
    now = window.index { |s| s.ends_at > at }
    return [] unless now

    anchor = airing_anchor(window, now)
    return [] unless anchor

    window[airing_edge(window, anchor, -1)..airing_edge(window, anchor, 1)]
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
    booked = book!(at)
    RequestNotifier.scheduled!(booked) if booked.any?
    SetPlanner.tick!(at)
  end

  def self.book!(at)
    return [] if BroadcastSegment.where("ends_at > ?", at + HORIZON).exists?

    booked = []
    locked do
      last = BroadcastSegment.chronological.last
      # Dead air (server was off): restart the timeline at now.
      cursor = last && last.ends_at > at ? last.ends_at : at

      while cursor < at + HORIZON
        tracks = next_show_tracks
        break if tracks.empty?
        with_station_id(tracks).each do |track|
          ends = cursor + track.duration_ms / 1000.0
          booked << BroadcastSegment.create!(track: track, starts_at: cursor, ends_at: ends)
          cursor = ends
        end
      end
    end
    booked
  end

  # One station ID per set change. A show's own opening says the station's
  # name, the show and the DJ, so it is the station ID; only a show without
  # one gets an ID clip booked ahead of it.
  def self.with_station_id(tracks)
    return tracks if tracks.first.artist == Track::STATION_ARTIST
    id = Interlude.station_id
    id ? [id] + tracks : tracks
  end

  # Least-recently-aired show or set with playable tracks; never-aired first.
  def self.next_show_tracks
    last_aired = BroadcastSegment.joins(:track).group("tracks.show_id").maximum(:starts_at)
    shows = Show.airable.includes(:tracks).sort_by { |s| [last_aired[s.id] || Time.at(0), s.id] }
    shows.each do |show|
      tracks = show.tracks.ordered.select { |t| t.duration_ms.to_i > 0 && t.audio_path && File.exist?(t.audio_path) }
      return tracks if tracks.any?
    end
    []
  end

  AIRING_REACH = 12.hours

  # The set's own segment nearest now: the one on air, or for a request on
  # air the set it interrupted, or for a station ID the set it introduces.
  def self.airing_anchor(window, now)
    set_track = ->(i) { (seg = window[i]) && seg.source != "request" && seg.track.show.kind != "interlude" }
    return now if set_track.(now)

    if window[now].source == "request"
      back = now - 1
      back -= 1 while back >= 0 && window[back].source == "request" && contiguous?(window[back], window[back + 1])
      return back if back >= 0 && contiguous?(window[back], window[back + 1]) && set_track.(back)
    end
    (now + 1...window.size).find { |i| set_track.(i) }
  end

  # Walk from the anchor in one direction (step -1 or 1) while segments stay
  # back to back and the show's tracks keep running in order; a track order
  # that wraps is the next or previous airing of the same show.
  def self.airing_edge(window, anchor, step)
    show_id = window[anchor].track.show_id
    position = window[anchor].track.position
    edge = anchor
    loop do
      seg = window[edge + step] if (edge + step).between?(0, window.size - 1)
      break unless seg && contiguous?(*[ seg, window[edge] ].sort_by(&:starts_at))
      if seg.source != "request"
        break unless seg.track.show_id == show_id && (seg.track.position <=> position) == step
        position = seg.track.position
      end
      edge += step
    end
    edge
  end

  # Back to back on the timeline (a request insert shifts both ends together).
  def self.contiguous?(before, after)
    (after.starts_at - before.ends_at).abs < 1
  end

  def self.locked
    BroadcastSegment.transaction do
      BroadcastSegment.connection.execute("SELECT pg_advisory_xact_lock(#{LOCK_KEY})")
      yield
    end
  end
  private_class_method :book!, :with_station_id, :next_show_tracks, :airing_anchor, :airing_edge, :contiguous?, :locked
end
