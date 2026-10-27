# A listener asking the station for a song. Artists on D.I.R. are made up: a
# known artist lends its sound (matched_track), an unknown one is born here.
class SongRequest < ApplicationRecord
  DAILY_LIMIT = 3

  belongs_to :user
  belongs_to :matched_track, class_name: "Track", optional: true
  belongs_to :track, optional: true

  # ready: rendered, waiting in the library for a set. scheduled: a set with it
  # is on the timeline and the listener has their email.
  enum :status, { pending: 0, rejected: 1, queued: 2, generating: 3, ready: 4, failed: 5, scheduled: 6 }

  validates :artist, presence: true, length: { maximum: 60 }
  validates :title, presence: true, length: { maximum: 80 }
  validates :note, length: { maximum: 140 }

  normalizes :artist, :title, :note, with: ->(s) { s.to_s.gsub(/\s+/, " ").strip.presence }

  scope :recent, -> { order(created_at: :desc) }
  # Rendered and not yet in any set.
  scope :waiting_for_set, -> { ready.where.not(track_id: nil).where.not(track_id: Track.where.not(origin_track_id: nil).select(:origin_track_id)) }
  scope :today, -> { where(created_at: Time.current.beginning_of_day..) }

  # The newest station track by this artist, ignoring the station's own drops.
  def self.match_artist(name)
    Track.where("lower(artist) = ?", name.to_s.downcase.strip)
      .where.not(artist: "Dead Internet Radio")
      .order(id: :desc).first
  end
end
