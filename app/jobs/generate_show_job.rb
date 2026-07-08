# frozen_string_literal: true

require 'English'
require 'open3'
class GenerateShowJob < ApplicationJob
  include ShowImporter

  queue_as :default

  def perform(job_id)
    gen_job = GenerationJob.find(job_id)
    return unless gen_job.pending?

    gen_job.update!(status: :running, started_at: Time.current, output_log: '')
    log = []
    ace_session = nil

    begin
      root = Rails.root.to_s
      slot = gen_job.slot
      count = gen_job.track_count

      # Step 1: Acquire ACE-Step + Run generate.py
      unless gen_job.dry_run?
        ace_session = AceStepManager.acquire
      end

      cmd1 = ['python3', 'generate.py', slot, '--tracks', count.to_s]
      cmd1 += ['--dj-name', gen_job.dj_name] if gen_job.dj_name
      cmd1 += ['--dry-run'] if gen_job.dry_run?

      append_log(log, gen_job, 'Running: generate.py')
      output1, exit1 = run_and_stream(log, gen_job, cmd1, chdir: root)
      append_log(log, gen_job, "Exit: #{exit1}")

      show_dir = nil
      output1.each_line do |line|
        show_dir = ::Regexp.last_match(1).strip if line =~ /Show\s+folder:\s+(.+)/
      end

      if show_dir && !gen_job.dry_run?
        # Free GPU memory between generation and mixing
        AceStepManager.reinitialize!
        cmd2 = ['python3', 'djmix.py', show_dir, '--crossfade', gen_job.crossfade.to_s]
        append_log(log, gen_job, 'Running: djmix.py')
        _output2, exit2 = run_and_stream(log, gen_job, cmd2, chdir: root)
        append_log(log, gen_job, "Exit: #{exit2}")

        append_log(log, gen_job, 'Importing into database...')
        import_show(show_dir, gen_job)
        append_log(log, gen_job, 'Import complete.')
      end

      gen_job.update!(status: :done, completed_at: Time.current, output_log: log.join("\n"))
    rescue StandardError => e
      log << "ERROR: #{e.message}"
      gen_job.update!(status: :failed, completed_at: Time.current, output_log: log.join("\n"))
    ensure
      AceStepManager.release(ace_session) if ace_session
    end
  end

  private

  def run_and_stream(log, gen_job, cmd, chdir:)
    output = +''
    line_count = 0
    exit_status = nil
    Open3.popen2e(*cmd, chdir: chdir) do |_stdin, stdout_err, wait_thr|
      stdout_err.each_line do |line|
        output << line
        log << line.chomp
        ProgressParser.parse(gen_job, line)
        line_count += 1
        flush_log(gen_job, log) if line_count % 3 == 0
      end
      flush_log(gen_job, log)
      exit_status = wait_thr.value.exitstatus
    end
    [output, exit_status]
  end

  def append_log(log, gen_job, msg)
    log << msg
    flush_log(gen_job, log)
  end

  def flush_log(gen_job, log)
    gen_job.update_column(:output_log, log.join("\n"))
  end

  def import_show(show_dir, gen_job)
    root = Rails.root.to_s
    full_path = File.join(root, show_dir)
    return unless Dir.exist?(full_path)

    playlist_path = File.join(full_path, 'playlist.json')
    return unless File.exist?(playlist_path)

    data = JSON.parse(File.read(playlist_path))
    return unless data['tracks'].is_a?(Array)

    show = Show.create!(
      slot: gen_job.slot,
      name: data['showName'],
      dj_name: data['djName'],
      track_count: data['tracks'].length,
      directory: show_dir,
      status: :complete,
      generated_at: Time.current
    )

    data['tracks'].each_with_index do |track_data, idx|
      Track.create!(
        show: show,
        position: idx + 1,
        title: track_data['title'],
        artist: track_data['artist'],
        caption: track_data['caption'],
        bpm: track_data['bpm'],
        key: track_data['key'],
        duration_ms: track_data['durationMs'],
        audio_file: track_data['file'],
        voiceover_file: track_data['voiceoverFile'],
        cue_seconds: track_data['cueSeconds']
      )
    end

    import_cues(show, root)
    import_mix_file(show, root)

    gen_job.update!(show: show)
  end
end
