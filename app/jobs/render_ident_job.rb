# frozen_string_literal: true

require "open3"

# Voices one station ID line with Kokoro (announce.py) on this server. Kokoro
# runs on the CPU in seconds, so this needs neither ACE-Step nor the generation
# PC; it needs kokoro/.venv here. A kept render joins the clip list off air.
class RenderIdentJob < ApplicationJob
  queue_as :default
  limits_concurrency key: "ident-render", duration: 10.minutes

  TIMEOUT = 300

  def perform(render_id)
    render = IdentRender.find_by(id: render_id)
    return unless render&.queued?

    render.rendering!
    raise "Kokoro isn't installed on this server (kokoro/.venv)" unless IdentRender.kokoro?

    FileUtils.mkdir_p(IdentRender::DIR)
    output, status = run(render.command)
    raise(output.lines.last(3).join.strip.presence || "announce.py failed") unless status.success? && render.path.exist?

    render.keep! unless render.preview
    render.done!
  rescue StandardError => e
    render&.update!(status: :failed, error: e.message.truncate(500))
  end

  private

  def run(cmd)
    Open3.popen2e(*cmd, chdir: Rails.root.to_s) do |stdin, out, wait|
      stdin.close
      reader = Thread.new { out.read }
      unless wait.join(TIMEOUT)
        Process.kill("KILL", wait.pid)
        raise "Kokoro took longer than #{TIMEOUT / 60} minutes"
      end
      [reader.value, wait.value]
    end
  end
end
