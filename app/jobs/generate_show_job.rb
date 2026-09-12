# frozen_string_literal: true

class GenerateShowJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes

  def perform(job_id)
    gen_job = GenerationJob.find(job_id)
    return unless gen_job.pending?

    gen_job.update!(status: :running, started_at: Time.current, output_log: '')
    @gen_job = gen_job
    @buffer = +''
    @show_dir = nil

    begin
      root = Rails.root.to_s

      # Step 1: Acquire ACE-Step + Run generate.py
      unless gen_job.dry_run?
        @ace_session = AceStepManager.acquire
      end

      resume_dir = detect_resume_dir(gen_job, root)

      cmd1 = ['python3', 'generate.py', gen_job.slot, '--tracks', gen_job.track_count.to_s]
      cmd1 += ['--dj-name', gen_job.dj_name] if gen_job.dj_name
      cmd1 += ['--dry-run'] if gen_job.dry_run?
      cmd1 += ['--resume-dir', resume_dir] if resume_dir

      say(resume_dir ? "Resuming in #{resume_dir}" : 'Running: generate.py')
      exit1 = run_and_stream(cmd1, chdir: root) { |line| capture_show_dir(line) }
      say("Exit: #{exit1}")
      raise "generate.py failed with exit #{exit1}" if exit1 != 0

      if @show_dir && !gen_job.dry_run?
        # Free GPU memory between generation and mixing
        unless AceStepManager.reinitialize!
          say('WARNING: ACE-Step reinitialize failed — GPU memory may still be held for djmix')
        end
        cmd2 = ['python3', 'djmix.py', @show_dir, '--crossfade', gen_job.crossfade.to_s]
        say('Running: djmix.py')
        exit2 = run_and_stream(cmd2, chdir: root)
        say("Exit: #{exit2}")

        say('Importing into database...')
        import_show(@show_dir, gen_job)
        say('Import complete.')
      end

      gen_job.update!(status: :done, completed_at: Time.current)
    rescue StandardError => e
      say("ERROR: #{e.message}")
      gen_job.update!(status: :failed, completed_at: Time.current)
    ensure
      AceStepManager.release(@ace_session) if @ace_session
    end
  end

  private

  def capture_show_dir(line)
    if line =~ /Show\s+folder:\s+(.+)/ || line =~ /Resuming\s+generation\s+in\s+(.+)/
      @show_dir = ::Regexp.last_match(1).strip
    end
  end

  def detect_resume_dir(gen_job, root)
    resume_dir = gen_job.options&.dig('show_dir')
    if resume_dir.blank? && gen_job.options&.dig('tracks').present?
      first_file = gen_job.options['tracks'].values.find { |t| t['file'].present? }
      resume_dir = File.dirname(first_file['file']) if first_file
    end
    return nil if resume_dir.blank?
    return nil unless Dir.exist?(File.join(root, resume_dir))

    resume_dir
  end

  def import_show(show_dir, gen_job)
    root = Rails.root.to_s
    full_path = File.join(root, show_dir)
    return unless Dir.exist?(full_path)

    playlist_path = File.join(full_path, 'playlist.json')
    return unless File.exist?(playlist_path)

    data = JSON.parse(File.read(playlist_path))
    return unless data['tracks'].is_a?(Array)

    show = Show.find_or_create_by!(directory: show_dir) do |s|
      s.slot = gen_job.slot
    end
    show.update!(
      slot: gen_job.slot,
      name: data['showName'],
      dj_name: data['djName'],
      track_count: data['tracks'].length,
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
