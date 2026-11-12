# One slot on the shared D.I.R. timeline. Every listener hears the same
# segment at the same moment; the player seeks to (now - starts_at).
class BroadcastSegment < ApplicationRecord
  belongs_to :track

  scope :chronological, -> { order(:starts_at) }
  scope :upcoming, ->(at = Time.current) { where("ends_at > ?", at).chronological }

  # Each song's next booking (its own or a set copy's), keyed by song id.
  def self.next_for(song_ids, at = Time.current)
    return {} if song_ids.blank?

    upcoming(at).joins(:track).where("COALESCE(tracks.origin_track_id, tracks.id) IN (?)", song_ids)
                .includes(:track).group_by { |s| s.track.song_id }.transform_values(&:first)
  end

  # The shape the player reads, from /broadcast and /airing alike.
  def to_api
    t = track
    {
      id: id,
      trackId: t.id,
      songId: t.votable? ? t.song_id : nil,
      startsAt: (starts_at.to_f * 1000).round,
      durationMs: duration_ms,
      source: source,
      file: "/media/tracks/#{t.id}",
      voiceoverFile: t.voiceover_file.present? ? "/media/tracks/#{t.id}/voiceover" : nil,
      title: t.title,
      artist: t.artist,
      caption: t.caption,
      bpm: t.bpm,
      key: t.key,
      showName: t.show.name,
      djName: t.show.dj_name,
      interlude: t.show.kind == "interlude"
    }
  end

  def duration_ms
    ((ends_at - starts_at) * 1000).round
  end
end
