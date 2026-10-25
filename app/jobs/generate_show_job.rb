# frozen_string_literal: true

class GenerateShowJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes
  # Dev runs jobs on the :async adapter, which ignores limits_concurrency.
  # Two renders at once is what crashes the machine, so serialise in-process too.
  RENDER_LOCK = Mutex.new

  def perform(job_id)
    RENDER_LOCK.synchronize { render(job_id) }
  end

  private

  def render(job_id)
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

      cmd1 = [Rails.configuration.x.python, 'generate.py', gen_job.slot, '--tracks', gen_job.track_count.to_s]
      cmd1 += ['--dj-name', gen_job.dj_name] if gen_job.dj_name
      cmd1 += ['--dry-run'] if gen_job.dry_run?
      cmd1 += ['--resume-dir', resume_dir] if resume_dir
      cmd1 += ['--stop-ace-step'] unless gen_job.dry_run?

      say(resume_dir ? "Resuming in #{resume_dir}" : 'Running: generate.py')
      exit1 = run_and_stream(cmd1, chdir: root) { |line| capture_show_dir(line) }
      say("Exit: #{exit1}")
      raise "generate.py failed with exit #{exit1}" if exit1 != 0

      if @show_dir && !gen_job.dry_run?
        # generate.py already shut ACE-Step down before the voiceovers; make sure it stays down for the mix.
        AceStepManager.stop! if AceStepManager.healthy?
        cmd2 = [Rails.configuration.x.python, 'djmix.py', @show_dir, '--crossfade', gen_job.crossfade.to_s]
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
end
