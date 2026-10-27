class Track < ApplicationRecord
  STATION_ARTIST = "Dead Internet Radio"

  belongs_to :show
  # A set plays songs from the library: its track points back at the song.
  belongs_to :origin_track, class_name: "Track", optional: true
  has_many :plays, class_name: "Track", foreign_key: :origin_track_id, dependent: :nullify, inverse_of: :origin_track
  has_many :votes, dependent: :delete_all

  validates :position, presence: true,
    uniqueness: { scope: :show_id }

  scope :ordered, -> { order(position: :asc) }
  # Every song the station has rendered: not the station's own openings, not
  # a set's copy of a song.
  scope :songs, -> {
    joins(:show).merge(Show.completed).where(origin_track_id: nil)
      .where.not(artist: [nil, "", STATION_ARTIST]).where("tracks.duration_ms > 0")
  }

  # The library song this track plays (itself, unless it's in a set).
  def song
    origin_track || self
  end

  def song_id
    origin_track_id || id
  end

  def votable?
    artist.present? && artist != STATION_ARTIST
  end

  def score
    up_votes - down_votes
  end

  # Listeners turned it away: it leaves rotation, and its sound becomes a lesson.
  def retired?
    down_votes >= 3 && down_votes > 2 * up_votes
  end

  # Resolve the DB-stored path to the canonical master on disk.
  # DB stores a link (e.g. "audio/00-foo.mp3"); the real file lives in
  # output/<show.directory>/<basename>. Returns nil if unresolvable.
  def audio_path
    resolve_media(audio_file)
  end

  def voiceover_path
    resolve_media(voiceover_file)
  end

  # The ACE-Step caption this track was rendered from. The caption column only
  # holds "artist — title", the real one is in the show's prompt log.
  def sound_caption
    return nil if audio_file.blank? || show&.directory.blank?
    log = Rails.root.join("output", show.directory, "prompts", "#{File.basename(audio_file, '.*')}.prompt.json")
    JSON.parse(File.read(log)).dig("payload", "caption").presence if log.exist?
  rescue JSON::ParserError
    nil
  end

  private

  def resolve_media(rel)
    return nil if rel.blank? || show&.directory.blank?
    Rails.root.join("output", show.directory, File.basename(rel))
  end
end
