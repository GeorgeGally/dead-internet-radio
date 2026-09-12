# frozen_string_literal: true

class RemixShowJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes

  def perform(show_id)
    show = Show.find(show_id)
    return unless show.directory

    root = Rails.root.to_s
    gen_job = GenerationJob.create!(
      slot: show.slot,
      track_count: show.track_count,
      status: :running,
      started_at: Time.current,
      output_log: '',
      show: show
    )
    @gen_job = gen_job
    @buffer = +''

    begin
      say('Running: djmix.py (remix)')
      exit_status = run_and_stream(['python3', 'djmix.py', show.directory], chdir: root)
      say("Exit: #{exit_status}")

      import_cues(show, root)
      import_mix_file(show, root)

      gen_job.update!(status: :done, completed_at: Time.current)
    rescue StandardError => e
      say("ERROR: #{e.message}")
      gen_job.update!(status: :failed, completed_at: Time.current)
    end
  end
end
