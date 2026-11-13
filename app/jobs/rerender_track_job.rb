# frozen_string_literal: true

# Re-renders one song with the station's notes (rerender.py): the producer
# rewrites its sound, ACE-Step renders it, and the new audio takes the old
# file's place (the old one is kept in <show>/.replaced/). The song keeps its
# id, votes and plays. Sets already built keep the audio they linked.
#
# A remix (options kind "remix") renders the same song again as a new take,
# revised first by the producer when it carries instructions: rerender.py
# --take writes it to its own folder, imported as a one-song "remix" show, so
# the original song and its audio stay as they are.
class RerenderTrackJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes

  def perform(gen_job_id)
    @gen_job = GenerationJob.find(gen_job_id)
    return unless @gen_job.pending?

    @buffer = +''
    begin
      track = Track.find(@gen_job.options['track_id'])
      if @gen_job.options['kind'] == 'remix' && !AceStepManager.installed?
        payload = track.prompt_log['payload']
        raise 'No prompt log to remix from' if payload.blank? || payload['caption'].blank?
        take = { 'payload' => payload.merge('title' => track.title, 'artist' => track.artist),
                 'file' => track.audio_path.relative_path_from(Rails.root).to_s,
                 'notes' => @gen_job.options['instructions'] }.compact
        @gen_job.update!(options: @gen_job.options.merge('on_pc' => true, 'take' => take, 'dj_name' => track.show&.dj_name),
                         output_log: "Waiting for the generation PC\n")
        return
      end

      @gen_job.update!(status: :running, started_at: Time.current, output_log: '')
      root = Rails.root.to_s
      spec = nil
      show_dir = nil
      remix = @gen_job.options['kind'] == 'remix'

      @ace_session = AceStepManager.acquire
      cmd = [Rails.configuration.x.python, 'rerender.py', '--track-json', write_spec(track), '--stop-ace-step']
      cmd << '--take' if remix
      say("#{remix ? 'Remix' : 'Re-render'}: #{track.artist} — #{track.title}")
      exit_status = run_and_stream(cmd, chdir: root) do |line|
        spec = JSON.parse(Regexp.last_match(1)) if line =~ /^Spec: (\{.*\})$/
        show_dir = Regexp.last_match(1).strip if line =~ /^Show folder: (.+)$/
        # The producer's read on what went wrong and what it changed, for the job page.
        @gen_job.reload.update!(options: @gen_job.options.merge('review' => JSON.parse(Regexp.last_match(1)))) if line =~ /^Review: (\{.*\})$/
      end
      say("Exit: #{exit_status}")
      raise "rerender.py failed with exit #{exit_status}" if exit_status != 0 || spec.nil?

      remix ? import_take(show_dir) : replace_audio(track, spec)
      @gen_job.update!(status: :done, completed_at: Time.current)
    rescue StandardError => e
      say("ERROR: #{e.message}")
      @gen_job.update!(status: :failed, completed_at: Time.current)
    ensure
      AceStepManager.release(@ace_session) if @ace_session
    end
  end

  private

  def import_take(show_dir)
    raise 'rerender.py did not report a show folder' unless show_dir

    show = import_show(show_dir, @gen_job)
    say("New take: track ##{show.tracks.ordered.first.id}")
  end

  def replace_audio(track, spec)
    duration_ms = measured_ms(track.audio_path) || spec['duration'].to_i * 1000
    track.update!(
      bpm: spec['bpm'],
      key: spec['keyscale'].presence || track.key,
      lyrics: spec['lyrics'],
      duration_ms: duration_ms,
      mix_out_ms: MixOut.measure(track.audio_path, duration_ms),
    )
    say('Done. Remix the show to hear it in its mix.') if track.show&.mix_file.present?
  end

  def write_spec(track)
    dir = Rails.root.join('tmp', 'rerenders')
    FileUtils.mkdir_p(dir)
    path = dir.join("rerender-#{@gen_job.id}.json")
    path.write(JSON.generate(
      file: track.audio_path.relative_path_from(Rails.root).to_s,
      artist: track.artist,
      title: track.title,
      dj_name: track.show&.dj_name,
      instructions: @gen_job.options['instructions'],
    ))
    path.to_s
  end

  def measured_ms(path)
    out = `ffprobe -v error -show_entries format=duration -of csv=p=0 #{Shellwords.escape(path.to_s)} 2>/dev/null`
    (out.to_f * 1000).round if out.to_f.positive?
  end
end
