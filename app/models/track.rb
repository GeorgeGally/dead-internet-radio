class Track < ApplicationRecord
  STATION_ARTIST = "Dead Internet Radio"
  # The station's own vote (the admin's) counts as this many listeners'.
  STATION_WEIGHT = 3

  belongs_to :show
  # A set plays songs from the library: its track points back at the song.
  belongs_to :origin_track, class_name: "Track", optional: true
  has_many :plays, class_name: "Track", foreign_key: :origin_track_id, dependent: :nullify, inverse_of: :origin_track
  has_many :votes, dependent: :delete_all

  validates :position, presence: true,
    uniqueness: { scope: :show_id }

  scope :ordered, -> { order(position: :asc) }
  # The show's running order: a remix sits in its song's show as a version
  # (take), heard from the song's takes, not played as the next song.
  scope :running, -> { where(take: false) }
  # Every song the station has rendered: not the station's own openings, not
  # a set's copy of a song.
  scope :songs, -> {
    joins(:show).merge(Show.completed).where(origin_track_id: nil)
      .where.not(artist: [ nil, "", STATION_ARTIST ]).where("tracks.duration_ms > 0")
  }
  # SQL twins of vetoed?.
  scope :not_vetoed, -> { where(vetoed_at: nil).where.not(station_vote: -1) }
  scope :vetoed, -> { where.not(vetoed_at: nil).or(where(station_vote: -1)) }

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
    weighted_up - weighted_down
  end

  # Listeners turned it away: it leaves rotation, and its sound becomes a lesson.
  def retired?
    weighted_down >= 3 && weighted_down > 2 * weighted_up
  end

  # The station turned it away for good: vetoed, or disliked by the station.
  def vetoed?
    vetoed_at.present? || station_vote == -1
  end

  # Out of rotation: no new set picks it unless a listener asked for it.
  def kept_out?
    vetoed? || retired?
  end

  def weighted_up
    up_votes + (STATION_WEIGHT - 1) * station_vote.clamp(0, 1)
  end

  def weighted_down
    down_votes + (STATION_WEIGHT - 1) * -station_vote.clamp(-1, 0)
  end

  # The output/ folder the song was rendered into. A request or remix that
  # joined another show keeps its audio where it was rendered.
  def home_folder
    folder.presence || show&.directory
  end

  # Resolve the DB-stored path to the canonical master on disk.
  # DB stores a link (e.g. "audio/00-foo.mp3"); the real file lives in
  # output/<home_folder>/<basename>. Returns nil if unresolvable.
  def audio_path
    resolve_media(audio_file)
  end

  # What the song was made from: generate.py's prompt log beside the audio
  # (caption, lyrics, tempo, key, length; the DJ's prompts; re-render notes).
  def prompt_log
    path = audio_path && audio_path.dirname.join("prompts", "#{audio_path.basename('.mp3')}.prompt.json")
    path && File.exist?(path) ? JSON.parse(File.read(path)) : {}
  rescue JSON::ParserError
    {}
  end

  # What the live timeline books: the track up to where its sound ends
  # (MixOut), so its silent tail never airs.
  def air_ms
    mix_out_ms.to_i.between?(1, duration_ms.to_i) ? mix_out_ms : duration_ms.to_i
  end

  def voiceover_path
    resolve_media(voiceover_file)
  end

  # The ACE-Step caption this track was rendered from. The caption column only
  # holds "artist — title", the real one is in the show's prompt log.
  def sound_caption
    return nil if audio_file.blank? || home_folder.blank?
    log = Rails.root.join("output", home_folder, "prompts", "#{File.basename(audio_file, '.*')}.prompt.json")
    JSON.parse(File.read(log)).dig("payload", "caption").presence if log.exist?
  rescue JSON::ParserError
    nil
  end

  # The genre the caption opens with ("Electroclash, 130 BPM…"), when it opens
  # with one: a few words before the tempo, key or first comma.
  def genre
    lead = sound_caption.to_s.tr("\u00a0\u202f", "  ")
                        .split(/[,.;:(—–]|\s(?:at|in|with|of)\s|\s\d+\s*bpm/i, 2).first.to_s.strip
                        .sub(/\A(?:an?|the)\s+/i, "")
    return nil if lead.empty? || lead.length > 32 || lead.split.size > 3 || lead.match?(/\d|bpm/i)

    lead[0].upcase + lead[1..]
  end

  private

  def resolve_media(rel)
    return nil if rel.blank? || home_folder.blank?
    Rails.root.join("output", home_folder, File.basename(rel))
  end
end
