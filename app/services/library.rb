# The track library: every song rendered, reused across sets. Picks the pool
# a DJ builds a set from; the DJ (build_set.py) chooses and orders the story.
module Library
  RESTING = 6.hours   # a song that just aired sits out this long
  POOL_SIZE = 80

  # Library song id => last time it aired (or is booked to).
  def self.last_aired
    BroadcastSegment.joins(:track).group("COALESCE(tracks.origin_track_id, tracks.id)").maximum(:starts_at)
  end

  def self.plays
    BroadcastSegment.joins(:track).group("COALESCE(tracks.origin_track_id, tracks.id)").count
  end

  def self.songs
    Track.songs.includes(:show)
  end

  # The candidates for a new set: requests first (they must play), then the
  # songs listeners like, then the ones that haven't aired for longest.
  # Vetoed, retired and recently aired songs sit out.
  def self.pool(at: Time.current)
    aired = last_aired
    waiting = SongRequest.waiting_for_set.includes(:user).index_by(&:track_id)
    songs = self.songs.where(vetoed_at: nil).to_a.select { |t| t.audio_path && File.exist?(t.audio_path) }
    songs.reject! { |t| t.retired? && !waiting.key?(t.id) }
    songs.reject! { |t| !waiting.key?(t.id) && aired[t.id] && aired[t.id] > at - RESTING }
    songs.sort_by! { |t| [waiting.key?(t.id) ? 0 : 1, -t.score, aired[t.id] || Time.at(0), t.id] }
    songs.first(POOL_SIZE).map { |t| candidate(t, waiting[t.id]) }
  end

  def self.candidate(track, request)
    {
      id: track.id,
      artist: track.artist,
      title: track.title,
      bpm: track.bpm,
      key: track.key,
      seconds: (track.duration_ms / 1000.0).round,
      sound: track.sound_caption.to_s.first(220),
      score: track.score,
      file: track.audio_path.to_s,
      request: request && {
        id: request.id,
        requester: RequestFilter.blocked?(request.user.first_name) ? "a listener" : request.user.first_name,
        note: request.note,
      },
    }
  end

  # What listeners keep and what they turn away, for the DJ writing new songs.
  def self.taste
    songs = self.songs.where("up_votes + down_votes > 0").to_a
    liked = songs.select { |t| t.score >= 2 }.sort_by { |t| -t.score }.first(6)
    turned = (songs.select(&:retired?) + Track.songs.where.not(vetoed_at: nil).to_a).uniq.first(6)
    {
      liked: liked.filter_map(&:sound_caption),
      turned_away: turned.filter_map(&:sound_caption),
    }
  end

  # generate.py reads this before writing a new show.
  TASTE_PATH = Rails.root.join("output", "listener-taste.json")

  def self.write_taste!
    TASTE_PATH.write(JSON.pretty_generate(taste))
  rescue StandardError => e
    Rails.logger.warn("listener taste not written: #{e.message}")
  end
end
