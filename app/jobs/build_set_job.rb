# frozen_string_literal: true

# Builds a set from the track library: Rails picks the pool, build_set.py lets
# the DJ choose the songs and their story and voices the links, then the set
# is imported as a Show (kind "set") whose tracks point back at their songs.
# No ACE-Step: this is the job that can run on the server.
class BuildSetJob < ApplicationJob
  include ShowImporter
  include SubprocessRunner

  queue_as :default
  limits_concurrency key: 'set', duration: 20.minutes

  def perform(gen_job_id)
    @gen_job = GenerationJob.find(gen_job_id)
    return unless @gen_job.pending?

    @gen_job.update!(status: :running, started_at: Time.current, output_log: '')
    @buffer = +''
    show_dir = nil
    root = Rails.root.to_s

    pool = Library.pool
    raise 'The library is empty' if pool.empty?

    say("Pool: #{pool.size} songs, #{pool.count { |c| c[:request] }} requests")
    cmd = [Rails.configuration.x.python, 'build_set.py', '--set-json', write_spec(pool)]
    cmd << '--dry-run' if @gen_job.dry_run?
    cmd << '--no-voice' if @gen_job.options&.dig('no_voice')
    say('Running: build_set.py')
    exit1 = run_and_stream(cmd, chdir: root) { |line| show_dir = ::Regexp.last_match(1).strip if line =~ /Show\s+folder:\s+(.+)/ }
    say("Exit: #{exit1}")
    raise "build_set.py failed with exit #{exit1}" if exit1 != 0

    unless @gen_job.dry_run?
      raise 'build_set.py did not report a show folder' unless show_dir

      show = import_show(File.join(root, show_dir), @gen_job)
      link_songs(show, File.join(root, show_dir))
      say("Imported: #{show.name}, #{show.tracks.count} tracks")
    end
    @gen_job.update!(status: :done, completed_at: Time.current)
  rescue StandardError => e
    say("ERROR: #{e.message}") if @buffer
    @gen_job&.update!(status: :failed, completed_at: Time.current)
  end

  private

  def write_spec(pool)
    dir = Rails.root.join('tmp', 'sets')
    FileUtils.mkdir_p(dir)
    path = dir.join("set-#{@gen_job.id}.json")
    path.write(JSON.pretty_generate(
      slot: @gen_job.slot,
      minutes: (@gen_job.options&.dig('minutes') || 60).to_i,
      dj_name: @gen_job.dj_name,
      candidates: pool
    ))
    path.to_s
  end

  # show.json maps each file in the set to the library song it plays.
  def link_songs(show, dir)
    library = JSON.parse(File.read(File.join(dir, 'show.json'))).fetch('library', {})
    show.update!(kind: 'set')
    show.tracks.each do |track|
      origin = library[File.basename(track.audio_file.to_s)]
      track.update!(origin_track_id: origin) if origin
    end
  end
end
