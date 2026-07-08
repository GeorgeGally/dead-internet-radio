# frozen_string_literal: true

require 'open3'
class BuildSiteJob < ApplicationJob
  queue_as :default

  def perform
    root = Rails.root.to_s
    log = []

    gen_job = GenerationJob.create!(
      slot: '[build site]',
      track_count: 0,
      status: :running,
      started_at: Time.current,
      output_log: ''
    )

    begin
      cmd = ['python3', 'build_site.py']
      append_log(log, gen_job, 'Running: build_site.py')
      run_and_stream(log, gen_job, cmd, chdir: root)
      append_log(log, gen_job, "Exit: #{$CHILD_STATUS.exitstatus}")

      gen_job.update!(status: :done, completed_at: Time.current, output_log: log.join("\n"))
    rescue StandardError => e
      log << "ERROR: #{e.message}"
      gen_job.update!(status: :failed, completed_at: Time.current, output_log: log.join("\n"))
    end
  end

  private

  def run_and_stream(log, gen_job, cmd, chdir:)
    output = +''
    line_count = 0
    Open3.popen2e(*cmd, chdir: chdir) do |_stdin, stdout_err, wait_thr|
      stdout_err.each_line do |line|
        output << line
        log << line.chomp
        line_count += 1
        flush_log(gen_job, log) if line_count % 3 == 0
      end
      flush_log(gen_job, log)
      wait_thr.value
    end
    output
  end

  def append_log(log, gen_job, msg)
    log << msg
    flush_log(gen_job, log)
  end

  def flush_log(gen_job, log)
    gen_job.update_column(:output_log, log.join("\n"))
  end
end
