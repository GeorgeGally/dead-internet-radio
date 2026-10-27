# frozen_string_literal: true

# Renders one queued listener request as a 1-track show: generate.py with
# --request-json, then djmix.py, then import. The song waits in the library
# until a set picks it up (SetPlanner); the listener is emailed once that set
# is on the timeline. Local only: it needs ACE-Step. Shares the render lock
# with GenerateShowJob.
class FulfillRequestJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'generation', duration: 30.minutes

  SLOT = 'request line'

  def perform(request_id, dry_run: false)
    GenerateShowJob::RENDER_LOCK.synchronize { fulfill(request_id, dry_run) }
  end

  private

  def fulfill(request_id, dry_run)
    req = SongRequest.find(request_id)
    return unless req.queued?

    req.generating!
    @gen_job = GenerationJob.create!(slot: SLOT, track_count: 1, status: :running, started_at: Time.current,
                                     output_log: '', options: { 'request_id' => req.id, 'dry_run' => dry_run })
    @buffer = +''
    @show_dir = nil
    root = Rails.root.to_s

    begin
      @ace_session = AceStepManager.acquire unless dry_run

      cmd = [Rails.configuration.x.python, 'generate.py', SLOT, '--tracks', '1', '--request-json', write_request_json(req)]
      cmd += dry_run ? ['--dry-run'] : ['--stop-ace-step']
      say("Request ##{req.id}: \"#{req.title}\" by #{req.artist}")
      say('Running: generate.py')
      exit1 = run_and_stream(cmd, chdir: root) { |line| @show_dir = ::Regexp.last_match(1).strip if line =~ /Show\s+folder:\s+(.+)/ }
      say("Exit: #{exit1}")
      raise "generate.py failed with exit #{exit1}" if exit1 != 0

      if dry_run
        # Nothing rendered: the request goes back in line.
        req.queued!
      else
        raise 'generate.py did not report a show folder' unless @show_dir

        AceStepManager.stop! if AceStepManager.healthy?
        say('Running: djmix.py')
        exit2 = run_and_stream([Rails.configuration.x.python, 'djmix.py', @show_dir], chdir: root)
        say("Exit: #{exit2}")
        raise "djmix.py failed with exit #{exit2}" if exit2 != 0

        show = import_show(@show_dir, @gen_job)
        show.update!(kind: 'request')
        track = show.tracks.ordered.last
        req.update!(status: :ready, track: track)
        say("Ready: track ##{track.id}, waiting for a set")
      end

      @gen_job.update!(status: :done, completed_at: Time.current)
    rescue StandardError => e
      say("ERROR: #{e.message}")
      @gen_job.update!(status: :failed, completed_at: Time.current)
      req.update!(status: :failed)
    ensure
      AceStepManager.release(@ace_session) if @ace_session
    end
  end

  # What generate.py needs to write the request: who asked, what for, and the
  # sound to lean on (the matched artist's ACE-Step caption, if any).
  def write_request_json(req)
    dir = Rails.root.join('tmp', 'requests')
    FileUtils.mkdir_p(dir)
    path = dir.join("request-#{req.id}.json")
    # The name comes from Google, unscreened: it is read on air, so screen it.
    name = req.user.first_name
    path.write(JSON.pretty_generate(
      requester: RequestFilter.blocked?(name) ? 'a listener' : name,
      artist: req.artist,
      title: req.title,
      note: req.note,
      seed_caption: req.matched_track&.sound_caption
    ))
    path.to_s
  end
end
