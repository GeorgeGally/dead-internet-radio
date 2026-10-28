# Swaps one song in a set for another from the library. The new song is
# hard-linked into the set's folder in the old one's place (the old file and
# its DJ intro move to .replaced/: the intro names the old song, so that slot
# goes out without one). Bookings already on the timeline keep the slot and
# everything after it shifts by the difference in length.
class SetSwap
  class Error < StandardError; end

  def self.candidates(track, query: nil, limit: 8)
    in_set = track.show.tracks.where.not(origin_track_id: nil).pluck(:origin_track_id)
    songs = Track.songs.includes(:show).where(vetoed_at: nil).where.not(id: in_set)
    if query.present?
      q = "%#{Track.sanitize_sql_like(query)}%"
      songs = songs.where("tracks.artist ILIKE ? OR tracks.title ILIKE ?", q, q)
    end
    songs = songs.to_a.select { |s| s.audio_path && File.exist?(s.audio_path) }.reject(&:retired?)
    bpm = track.bpm.to_f
    songs.sort_by { |s| [bpm.positive? && s.bpm ? (s.bpm.to_f - bpm).abs : 999, -s.score, -s.id] }.first(limit)
  end

  def self.swap!(track, song, at: Time.current)
    raise Error, "Only a set's songs can be swapped" unless track.origin_track_id && track.show&.kind == "set"
    raise Error, "That song isn't in the library" unless Track.songs.exists?(song.id) && song.audio_path && File.exist?(song.audio_path)
    raise Error, "It's on air right now" if BroadcastSegment.where(track: track).where("starts_at <= ? AND ends_at > ?", at, at).exists?

    dir = Rails.root.join("output", track.show.directory)
    prefix = track.audio_file.to_s[/\A\d+/] || format("%02d", track.position - 1)
    name = "#{prefix}-#{File.basename(song.audio_path).sub(/\A\d+-/, '')}"
    replaced = dir.join(".replaced")
    FileUtils.mkdir_p(replaced)
    [track.audio_path, track.voiceover_path].compact.each do |path|
      FileUtils.mv(path, replaced.join(path.basename)) if File.exist?(path)
    end
    dest = dir.join(name)
    begin
      File.link(song.audio_path, dest)
    rescue SystemCallError
      FileUtils.cp(song.audio_path, dest)
    end
    log = song.audio_path.dirname.join("prompts", "#{song.audio_path.basename('.mp3')}.prompt.json")
    FileUtils.mkdir_p(dir.join("prompts"))
    FileUtils.cp(log, dir.join("prompts", "#{dest.basename('.mp3')}.prompt.json")) if File.exist?(log)

    old_ms = track.duration_ms.to_i
    Track.transaction do
      track.update!(origin_track: song, artist: song.artist, title: song.title, bpm: song.bpm, key: song.key,
                    caption: song.caption, lyrics: song.lyrics, duration_ms: song.duration_ms,
                    audio_file: name, voiceover_file: nil, cue_seconds: nil)
      reflow!(track, (song.duration_ms.to_i - old_ms) / 1000.0, at)
    end
    track
  end

  # Each future booking of the slot stretches or shrinks; later ones follow.
  def self.reflow!(track, delta, at)
    return if delta.zero?

    BroadcastSegment.where(track: track).where("starts_at > ?", at).order(starts_at: :desc).each do |seg|
      BroadcastSegment.where("starts_at >= ?", seg.ends_at)
        .update_all(["starts_at = starts_at + make_interval(secs => ?), ends_at = ends_at + make_interval(secs => ?)", delta, delta])
      seg.update_columns(ends_at: seg.ends_at + delta)
    end
  end
  private_class_method :reflow!
end
