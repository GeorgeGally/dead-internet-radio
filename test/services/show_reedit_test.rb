# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class ShowReeditTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    @show_dir = File.join(Dir.mktmpdir, "reedit-show")
    FileUtils.mkdir_p(File.join(@show_dir, "prompts"))
    @show = Show.create!(slot: "reedit", name: "Re-edit Show", track_count: 2,
                         directory: @show_dir, status: :complete)
    @songs = %w[first second].each_with_index.map do |name, i|
      song = Track.create!(show: @show, position: i + 1, title: name, artist: "Test Artist",
                           audio_file: File.join(@show_dir, "0#{i + 1}-#{name}.mp3"))
      File.write(song.audio_path, "audio")
      File.write(File.join(@show_dir, "prompts", "0#{i + 1}-#{name}.prompt.json"),
                 JSON.generate(payload: { caption: "darkwave #{name}", bpm: 120 }))
      song
    end
  end

  teardown do
    ActiveJob::Base.queue_adapter = @old_queue_adapter
    FileUtils.rm_rf(@show_dir)
  end

  test "a whole-mix re-edit renders every song once with the same notes" do
    batch = ShowReedit.start!(@show, @songs, "darker and slower")

    jobs = GenerationJob.order(:id).last(2)
    assert_equal 2, jobs.size
    assert_equal [ batch ], jobs.map { |j| j.options["batch_id"] }.uniq
    assert_equal @songs.map(&:id), jobs.map { |j| j.options["track_id"] }
    assert_equal [ "darker and slower" ], jobs.map { |j| j.options["instructions"] }.uniq
    assert_equal [ "rerender" ], jobs.map { |j| j.options["kind"] }.uniq
    assert_enqueued_jobs 2, only: RerenderTrackJob
  end

  test "the mix is asked for only once the last track has finished" do
    ShowReedit.start!(@show, @songs, "darker")
    first, second = GenerationJob.order(:id).last(2)

    first.update!(status: :done, completed_at: Time.current)
    ShowReedit.complete!(first)
    assert_no_enqueued_jobs only: RemixShowJob
    assert ShowReedit.running?(@show)

    second.update!(status: :done, completed_at: Time.current)
    assert_enqueued_with(job: RemixShowJob, args: [ @show.id ]) { ShowReedit.complete!(second) }
    refute ShowReedit.running?(@show)
  end

  test "a track finishing twice asks for the mix once" do
    ShowReedit.start!(@show, @songs, "darker")
    generation = GenerationJob.order(:id).last(2)
    generation.each { |j| j.update!(status: :done, completed_at: Time.current) }

    ShowReedit.complete!(generation.last)
    ShowReedit.complete!(generation.last)
    assert_enqueued_jobs 1, only: RemixShowJob
  end

  test "a failed track still lets the show be mixed" do
    ShowReedit.start!(@show, @songs, "darker")
    first, second = GenerationJob.order(:id).last(2)

    first.update!(status: :failed, completed_at: Time.current)
    ShowReedit.complete!(first)
    second.update!(status: :done, completed_at: Time.current)
    assert_enqueued_with(job: RemixShowJob, args: [ @show.id ]) { ShowReedit.complete!(second) }
  end

  test "songs without a prompt log are left out" do
    FileUtils.rm_f(Dir[File.join(@show_dir, "prompts", "02-*.json")])

    assert_equal [ @songs.first.id ], ShowReedit.songs(@show).map(&:id)
  end

  test "a re-edit where every track failed says so" do
    ShowReedit.start!(@show, @songs, "darker")
    GenerationJob.order(:id).last(2).each { |job| job.update!(status: :failed, completed_at: Time.current) }

    assert_equal "failed", ShowReedit.progress(@show)[:status]
    assert ShowReedit.failed?(@show)
    refute ShowReedit.running?(@show)
  end
end
