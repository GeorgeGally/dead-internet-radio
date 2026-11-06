# A listener asking the station for a song. Artists on D.I.R. are made up: a
# known artist lends its sound (matched_track), an unknown one is born here.
class SongRequest < ApplicationRecord
  DAILY_LIMIT = 3

  belongs_to :user
  belongs_to :matched_track, class_name: "Track", optional: true
  belongs_to :track, optional: true

  # pending: the filter is still reading it. accepted: past the filter, waiting
  # for the generation PC. queued: in the PC's line. ready: rendered, waiting in
  # the library for a set. scheduled: on the timeline and the listener has their
  # email.
  enum :status, { pending: 0, rejected: 1, queued: 2, generating: 3, ready: 4, failed: 5, scheduled: 6, accepted: 7 }

  validates :artist, presence: true, length: { maximum: 60 }
  validates :title, presence: true, length: { maximum: 80 }
  validates :note, length: { maximum: 140 }

  normalizes :artist, :title, :note, with: ->(s) { s.to_s.gsub(/\s+/, " ").strip.presence }

  scope :recent, -> { order(created_at: :desc) }
  # Asked for and still on its way to a set.
  scope :outstanding, -> { where(status: %i[pending accepted queued generating ready]) }
  # Rendered and not yet in any set.
  scope :waiting_for_set, -> { ready.where.not(track_id: nil).where.not(track_id: Track.where.not(origin_track_id: nil).select(:origin_track_id)) }
  scope :today, -> { where(created_at: Time.current.beginning_of_day..) }

  # What generate.py --request-json needs: who asked, what for, and the sound to
  # lean on (the matched artist's ACE-Step caption, if any).
  def render_spec
    # The name comes from Google, unscreened: it is read on air, so screen it.
    name = user.first_name
    { requester: RequestFilter.blocked?(name) ? "a listener" : name,
      artist: artist, title: title, note: note, seed_caption: matched_track&.sound_caption }
  end

  # The newest station track by this artist, ignoring the station's own drops.
  def self.match_artist(name)
    Track.where("lower(artist) = ?", name.to_s.downcase.strip)
      .where.not(artist: "Dead Internet Radio")
      .order(id: :desc).first
  end
end
