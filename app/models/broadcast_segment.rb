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

  def duration_ms
    ((ends_at - starts_at) * 1000).round
  end
end
