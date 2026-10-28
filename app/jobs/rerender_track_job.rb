# frozen_string_literal: true

# Re-renders one song with the station's notes (rerender.py): the producer
# rewrites its sound, ACE-Step renders it, and the new audio takes the old
# file's place (the old one is kept in <show>/.replaced/). The song keeps its
# id, votes and plays. Sets already built keep the audio they linked.
class RerenderTrackJob < ApplicationJob
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes

  def perform(gen_job_id)
    @gen_job = GenerationJob.find(gen_job_id)
    return unless @gen_job.pending?

    @gen_job.update!(status: :running, started_at: Time.current, output_log: '')
    @buffer = +''
    track = Track.find(@gen_job.options['track_id'])
    root = Rails.root.to_s
    spec = nil

    begin
      @ace_session = AceStepManager.acquire
      cmd = [Rails.configuration.x.python, 'rerender.py', '--track-json', write_spec(track), '--stop-ace-step']
      say("Re-render: #{track.artist} — #{track.title}")
      exit_status = run_and_stream(cmd, chdir: root) { |line| spec = JSON.parse(Regexp.last_match(1)) if line =~ /^Spec: (\{.*\})$/ }
      say("Exit: #{exit_status}")
      raise "rerender.py failed with exit #{exit_status}" if exit_status != 0 || spec.nil?

      track.update!(
        bpm: spec['bpm'],
        key: spec['keyscale'].presence || track.key,
        lyrics: spec['lyrics'],
        duration_ms: measured_ms(track.audio_path) || spec['duration'].to_i * 1000,
      )
      say('Done. Remix the show to hear it in its mix.') if track.show&.mix_file.present?
      @gen_job.update!(status: :done, completed_at: Time.current)
    rescue StandardError => e
      say("ERROR: #{e.message}")
      @gen_job.update!(status: :failed, completed_at: Time.current)
    ensure
      AceStepManager.release(@ace_session) if @ace_session
    end
  end

  private

  def write_spec(track)
    dir = Rails.root.join('tmp', 'rerenders')
    FileUtils.mkdir_p(dir)
    path = dir.join("rerender-#{@gen_job.id}.json")
    path.write(JSON.generate(
      file: track.audio_path.relative_path_from(Rails.root).to_s,
      artist: track.artist,
      title: track.title,
      instructions: @gen_job.options['instructions'],
    ))
    path.to_s
  end

  def measured_ms(path)
    out = `ffprobe -v error -show_entries format=duration -of csv=p=0 #{Shellwords.escape(path.to_s)} 2>/dev/null`
    (out.to_f * 1000).round if out.to_f.positive?
  end
end
