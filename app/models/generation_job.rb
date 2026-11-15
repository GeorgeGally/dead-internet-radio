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
    options&.dig("crossfade").presence || 4
  end

  def dry_run?
    [true, '1'].include?(options&.dig('dry_run'))
  end

  def set?
    options&.dig('kind') == 'set'
  end

  # Preview and edit before sending: the plan is written first, edited on the
  # admin, and the show is made from exactly that once it is confirmed.
  def preview?
    options&.dig('preview') == true
  end

  def plan
    options&.dig('plan')
  end

  def plan_confirmed?
    options&.dig('plan_confirmed') == true
  end

  def awaiting_plan?
    preview? && !plan_confirmed?
  end

  # What generate.py is given as its slot. A confirmed plan rides along in it,
  # so the generation PC passes it on as it passes any slot.
  def generate_slot
    plan_confirmed? && plan ? "plan #{plan.to_json}" : slot
  end

  # The last thing the log says it is doing, for the job page's loader.
  def stage
    return 'Plan ready' if awaiting_plan? && plan.present?

    line = output_log.to_s.lines.map(&:strip).reject { |l| l.empty? || l.start_with?('[PROGRESS]') }.last
    line.presence&.truncate(140) || (awaiting_plan? ? 'Writing the plan' : 'Starting')
  end

  def live?
    (pending? || running?) && !(awaiting_plan? && plan.present?)
  end

  def total_tracks
    options&.dig('total_tracks') || track_count
  end

  def tracks_done
    (options&.dig('tracks') || {}).values.count { |t| t['status'] == 'done' }
  end

  # How far through the songs, 0..1, from what generate.py reports. Nil when
  # nothing does yet, as on the generation PC.
  def fraction
    tracks = options&.dig('tracks')
    return 1.0 if done?
    return nil if tracks.blank? || total_tracks.to_i.zero?

    current = tracks.values.find { |t| t['status'] == 'generating' && t['elapsed_s'] }
    part = current ? [current['elapsed_s'].to_f / [current['estimated_s'].to_f, 1].max, 0.95].min : 0
    [(tracks_done + part) / total_tracks.to_f, 0.99].min
  end

  # Titles for the songs not reported yet: from the plan when there is one.
  def planned_title(number)
    song = plan && plan['tracks'] && plan['tracks'][number - 1]
    song ? "#{song['artist']} — #{song['title']}" : "Track #{number}"
  end

  # A set picks its songs as it builds, so its count comes from the show.
  def tracks_shown
    set? ? show&.tracks&.count.to_i : track_count
  end
end
