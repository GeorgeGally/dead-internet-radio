# frozen_string_literal: true

require "test_helper"

class StationInterludeTest < ActiveSupport::TestCase
  setup do
    @root = Dir.mktmpdir
    BroadcastSegment.delete_all
    @talk = make_show("talk", "interlude", "01-talk-x.mp3", "02-station-id-03.mp3", "03-station-id-04.mp3")
    @one = make_show("one", "show", "01-a.mp3")
    @two = make_show("two", "show", "01-b.mp3")
  end

  teardown { FileUtils.rm_rf(@root) }

  def make_show(name, kind, *files)
    dir = File.join(@root, name)
    FileUtils.mkdir_p(dir)
    show = Show.create!(slot: "night", directory: dir, status: :complete, kind: kind, name: name)
    files.each_with_index do |file, index|
      File.write(File.join(dir, file), "x")
      show.tracks.create!(position: index + 1, title: file, artist: "Dead Internet Radio", duration_ms: 10_000, audio_file: file)
    end
    show
  end

  test "the station talks before each show and never airs the talk as a show" do
    Station.fill!
    kinds = BroadcastSegment.chronological.includes(track: :show).map { |seg| seg.track.show.kind }
    assert_equal %w[interlude interlude show], kinds.first(3)
    assert_equal kinds.count("show"), kinds.count("interlude") / 2
    refute_includes Show.airable, @talk
    refute_includes Show.programmes, @talk
  end

  test "an ID clip turned off at /admin/idents stays off, and IDs rotate" do
    StationIdent.create!(kind: "audio", number: 3, active: false)
    assert_includes Interlude.tracks.map(&:audio_file), "03-station-id-04.mp3"
    refute_includes Interlude.tracks.map(&:audio_file), "02-station-id-03.mp3"

    StationIdent.find_by!(number: 3).update!(active: true)
    aired = @talk.tracks.find_by!(audio_file: "03-station-id-04.mp3")
    BroadcastSegment.create!(track: aired, starts_at: 1.hour.ago, ends_at: 1.hour.ago + 10)
    assert_includes Interlude.tracks.map(&:audio_file), "02-station-id-03.mp3"
  end

  test "no talk built yet: the shows run straight on" do
    @talk.destroy!
    assert_empty Interlude.tracks
    Station.fill!
    assert_predicate BroadcastSegment.count, :positive?
  end
end

class SetPlannerVoiceTest < ActiveSupport::TestCase
  setup { SongRequest.delete_all; GenerationJob.delete_all }

  def with_voice(on)
    original = SetPlanner.method(:voiced?)
    SetPlanner.define_singleton_method(:voiced?) { on }
    yield
  ensure
    SetPlanner.define_singleton_method(:voiced?, original)
  end

  test "without Kokoro no filler set is built" do
    with_voice(false) { refute_predicate SetPlanner, :needed? }
  end

  test "with Kokoro the planner keeps a set waiting" do
    with_voice(true) { assert_predicate SetPlanner, :needed? }
  end
end
