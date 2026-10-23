# One slot on the shared D.I.R. timeline. Every listener hears the same
# segment at the same moment; the player seeks to (now - starts_at).
class BroadcastSegment < ApplicationRecord
  belongs_to :track

  scope :chronological, -> { order(:starts_at) }
  scope :upcoming, ->(at = Time.current) { where("ends_at > ?", at).chronological }

  def duration_ms
    ((ends_at - starts_at) * 1000).round
  end
end
