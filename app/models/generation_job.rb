# frozen_string_literal: true

class GenerationJob < ApplicationRecord
  belongs_to :show, optional: true

  enum :status, { pending: 0, running: 1, done: 2, failed: 3 }

  validates :slot, presence: true

  scope :recent, -> { order(created_at: :desc) }

  def dj_name
    options&.dig('dj_name').presence
  end

  def crossfade
    options&.dig('crossfade').presence || 5
  end

  def dry_run?
    [true, '1'].include?(options&.dig('dry_run'))
  end

  def set?
    options&.dig('kind') == 'set'
  end

  # A set picks its songs as it builds, so its count comes from the show.
  def tracks_shown
    set? ? show&.tracks&.count.to_i : track_count
  end
end
