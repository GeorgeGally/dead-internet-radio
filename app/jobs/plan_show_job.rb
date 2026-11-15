# frozen_string_literal: true

require "tmpdir"

# Writes a show's plan (names, brief, opening words, songs) for the admin to
# edit before anything is rendered. Only the LLM runs, so it runs here even
# where there is no ACE-Step.
class PlanShowJob < ApplicationJob
  include SubprocessRunner

  queue_as :default

  def perform(job_id)
    gen_job = GenerationJob.find(job_id)
    return unless gen_job.pending? && gen_job.awaiting_plan? && gen_job.plan.blank?

    gen_job.update!(started_at: Time.current, output_log: "")
    @gen_job = gen_job
    @buffer = +""

    Dir.mktmpdir("plan") do |dir|
      plan_path = File.join(dir, "plan.json")
      cmd = [ Rails.configuration.x.python, "generate.py", gen_job.slot, "--tracks", gen_job.track_count.to_s,
             "--plan-out", plan_path ]
      cmd += [ "--dj-name", gen_job.dj_name ] if gen_job.dj_name
      say("Writing the plan: generate.py --plan-out")
      exit_status = run_and_stream(cmd, chdir: Rails.root.to_s)
      say("Exit: #{exit_status}")
      raise "generate.py failed with exit #{exit_status}" if exit_status != 0

      plan = JSON.parse(File.read(plan_path))
      gen_job.reload
      # The plan's folder was thrown away: nothing resumes from it.
      gen_job.update!(options: gen_job.options.except("show_dir").merge("plan" => plan), started_at: nil)
      say("Plan ready")
    end
  rescue StandardError => e
    say("ERROR: #{e.message}") if @gen_job
    gen_job&.update!(status: :failed, completed_at: Time.current)
  end
end
