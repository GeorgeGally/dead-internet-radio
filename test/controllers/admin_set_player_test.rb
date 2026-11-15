# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class AdminSetPlayerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    @root = Dir.mktmpdir
    @lib_dir = File.join(@root, "lib-show")
    lib_dir = @lib_dir
    take_dir = File.join(@root, "take-show")
    set_dir = File.join(@root, "a-set")
    [ lib_dir, take_dir, set_dir ].each { |d| FileUtils.mkdir_p(d) }

    lib = Show.create!(slot: "night", directory: lib_dir, status: :complete)
    @song = lib.tracks.create!(position: 1, artist: "Old Band", title: "Old Song", bpm: 120, duration_ms: 150_000, audio_file: "01-old.mp3")
    File.write(File.join(lib_dir, "01-old.mp3"), "old")

    take_show = Show.create!(slot: "remix", kind: "remix", directory: take_dir, status: :complete)
    @take = take_show.tracks.create!(position: 1, artist: "Old Band", title: "Old Song", bpm: 120, duration_ms: 160_000, audio_file: "01-old.mp3")
    File.write(File.join(take_dir, "01-old.mp3"), "take")
    GenerationJob.create!(slot: "remix", track_count: 1, status: :done, show: take_show,
                          options: { "kind" => "remix", "track_id" => @song.id, "instructions" => "darker bass" })
    @queued = GenerationJob.create!(slot: "remix", track_count: 1, status: :pending,
                                    options: { "kind" => "remix", "track_id" => @take.id })

    @mix = Rails.root.join("mixes", "test-set-player-#{Process.pid}.mp3")
    FileUtils.mkdir_p(@mix.dirname)
    File.write(@mix, "mix")
    @set = Show.create!(slot: "night", name: "Night Set", kind: "set", directory: set_dir, status: :complete, mix_file: @mix.basename.to_s)
    @slot = @set.tracks.create!(position: 1, artist: "Old Band", title: "Old Song", duration_ms: 150_000, origin_track: @song,
                                audio_file: "01-old.mp3", cue_seconds: 0)
    File.link(File.join(lib_dir, "01-old.mp3"), File.join(set_dir, "01-old.mp3"))
    @job = GenerationJob.create!(slot: "night", track_count: 1, status: :done, show: @set, options: { "kind" => "set" })

    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  teardown do
    ActiveJob::Base.queue_adapter = @old_queue_adapter
    FileUtils.rm_rf(@root)
    FileUtils.rm_f(@mix)
  end

  test "every take of a song, its remixes' remixes too, oldest first" do
    takes = SongTakes.for(@take)
    assert_equal [ @song, @take, nil ], takes.map(&:song)
    assert_equal [ 0, 1, 2 ], takes.map(&:number)
    assert_equal "darker bass", takes[1].notes
  end

  test "the player lists the playing song's takes and the one in the set has no Use key" do
    get admin_generation_path(@job)
    assert_response :success
    assert_select "[data-set-player] .sp-song[data-track='#{@slot.id}'] .sp-takes li", 3
    assert_select ".sp-takes li.in-set", 1
    assert_select ".sp-takes form.sp-use", 1
    assert_select ".sp-takes .sp-wait", text: "Queued"
    assert_select "table.songs tr[data-track='#{@slot.id}'][data-cue='0.0']"
  end

  test "using a take swaps it into the set, remixes the set and comes back" do
    back = admin_generation_path(@job)
    assert_enqueued_with(job: RemixShowJob, args: [ @set.id ]) do
      post swap_admin_track_path(@slot), params: { song_id: @take.id, remix: 1, back: back }
    end
    assert_redirected_to back
    assert_equal @take.id, @slot.reload.origin_track_id
  end

  test "a back path off the admin is ignored" do
    post swap_admin_track_path(@slot), params: { song_id: @take.id, back: "//evil.example/admin/" }
    assert_redirected_to admin_show_path(@set)
  end

  test "kept re-renders show up as takes and Use switches the library master back" do
    replaced = File.join(@lib_dir, ".replaced")
    FileUtils.mkdir_p(replaced)
    File.write(File.join(@lib_dir, "01-old.mp3"), "new-master")
    File.write(File.join(replaced, "01-old-20260101-120000.mp3"), "old-master")
    File.write(File.join(replaced, "01-old-20260101-120000.prompt.json"),
               JSON.generate(payload: { bpm: 120, keyscale: "C", lyrics: "[Instrumental]", duration: 150 },
                             rerender: { notes: "darker bass" }))

    takes = SongTakes.for(@song)
    assert_equal 1, takes.count(&:rerender?)
    assert_equal "Current", takes.first.label("20260101-120000")
    assert_equal "Original", takes[1].label("20260101-120000")
    assert_equal "darker bass", takes[1].notes

    back = admin_generation_path(@job)
    post swap_admin_track_path(@slot), params: { replaced: "20260101-120000", remix: 1, back: back }
    assert_redirected_to back
    assert_equal "old-master", File.read(File.join(@lib_dir, "01-old.mp3"))
    assert_equal @song.id, @slot.reload.origin_track_id
    assert Dir.glob(File.join(replaced, "01-old-*.mp3")).size >= 1, "the swapped-out master stays in .replaced/"
  end
end
