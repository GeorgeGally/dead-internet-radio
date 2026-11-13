# frozen_string_literal: true

# Finds where each new track's sound ends (MixOut), newest first, so the
# station books it without its silent tail.
class MeasureMixOutsJob < ApplicationJob
  queue_as :default
  limits_concurrency key: "mix_outs", duration: 30.minutes

  BATCH = 400

  def perform
    Track.where(mix_out_ms: nil).where("duration_ms > 0").order(id: :desc).limit(BATCH).each do |track|
      track.update_column(:mix_out_ms, MixOut.measure(track.audio_path, track.duration_ms))
    end
  end
end
