# frozen_string_literal: true

require 'English'
require 'open3'

# Streams subprocess output into GenerationJob#output_log incrementally via SQL
# append (avoids O(n^2) full-log rewrites) and keeps any acquired AceStepSession
# fresh so idle cleanup cannot fire while a generation is streaming.
module SubprocessRunner
  extend ActiveSupport::Concern

  BUFFER_FLUSH_LINES = 25

  private

  def say(msg)
    @buffer << msg.chomp << "\n"
    flush_buffer
  end

  def run_and_stream(cmd, chdir:)
    line_count = 0
    exit_status = nil
    Open3.popen2e(*cmd, chdir: chdir) do |_stdin, stdout_err, wait_thr|
      stdout_err.each_line do |line|
        yield line if block_given?
        @buffer << line
        ProgressParser.parse(@gen_job, line.chomp)
        flush_buffer if (line_count += 1) % BUFFER_FLUSH_LINES == 0
      end
      flush_buffer
      status = wait_thr.value
      # Signal-killed subprocesses have no exitstatus — map to 128+sig like shells do.
      exit_status = status.exitstatus || (status.termsig ? 128 + status.termsig : 1)
    end
    exit_status
  end

  def flush_buffer
    return if @buffer.blank?

    GenerationJob.where(id: @gen_job.id).update_all(
      ["output_log = COALESCE(output_log, '') || ?", @buffer]
    )
    @buffer = +''
    @ace_session.touch_activity! if @ace_session.is_a?(AceStepSession)
  end
end
