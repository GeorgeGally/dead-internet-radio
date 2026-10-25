class Track < ApplicationRecord
  belongs_to :show

  validates :position, presence: true,
    uniqueness: { scope: :show_id }

  scope :ordered, -> { order(position: :asc) }

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
