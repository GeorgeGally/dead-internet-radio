class Show < ApplicationRecord
  has_many :tracks, dependent: :destroy
  has_many :generation_jobs, dependent: :nullify

  enum :status, { draft: 0, generating: 1, complete: 2, failed: 3 }

  validates :slot, presence: true
  validates :directory, uniqueness: true, allow_nil: true

  scope :completed, -> { where(status: :complete) }
  # Everything a listener can browse. Interludes are the station ID clips
  # between shows, not shows.
  scope :programmes, -> { completed.where.not(kind: "interlude") }
  # Requests and remixes render on their own but only ever air inside a set.
  scope :airable, -> { programmes.where.not(kind: %w[request remix]) }
  scope :recent, -> { order(Arel.sql("generated_at DESC NULLS LAST, id DESC")) }

  # DB stores a link to the mix (e.g. "dist/audio/foo.mp3"); the canonical
  # master lives in mixes/<basename>. Returns nil if unresolvable.
  def mix_path
    return nil if mix_file.blank?
    Rails.root.join("mixes", File.basename(mix_file))
  end
end
