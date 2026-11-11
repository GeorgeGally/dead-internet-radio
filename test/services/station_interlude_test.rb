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
      artist = kind == "interlude" || file.include?("opening") ? Track::STATION_ARTIST : "Someone"
      show.tracks.create!(position: index + 1, title: file, artist: artist, duration_ms: 10_000, audio_file: file)
    end
    show
  end

  def aired_files
    BroadcastSegment.chronological.includes(:track).map { |seg| seg.track.audio_file }
  end

  test "a set change airs one station ID: no talk, and the show's own opening stays off" do
    @one.destroy!
    @two.destroy!
    make_show("opened", "show", "00-dead-internet-radio-opening.mp3", "01-song.mp3", "02-song.mp3")
    Station.fill!
    files = aired_files
    assert_match Interlude::STATION_ID, files[0]
    assert_equal %w[01-song.mp3 02-song.mp3], files[1, 2]
    refute files.any? { |f| f.include?("talk") || f.include?("opening") }, files.first(6).inspect
    assert_equal files.count("01-song.mp3"), files.count { |f| f.match?(Interlude::STATION_ID) }
    refute_includes Show.airable, @talk
    refute_includes Show.programmes, @talk
  end

  test "with no ID clip built, the show's opening is its station ID" do
    @talk.destroy!
    @one.destroy!
    @two.destroy!
    make_show("opened", "show", "00-dead-internet-radio-opening.mp3", "01-song.mp3")
    Station.fill!
    assert_equal %w[00-dead-internet-radio-opening.mp3 01-song.mp3], aired_files.first(2)
  end

  test "with nothing new to air the station replays what it has" do
    Station.fill!
    assert_operator BroadcastSegment.joins(:track).where(tracks: { show_id: @one.id }).count, :>, 1
  end

  test "an ID clip turned off at /admin/idents stays off, and IDs rotate" do
    StationIdent.create!(kind: "audio", number: 3, active: false)
    assert_equal "03-station-id-04.mp3", Interlude.station_id.audio_file

    StationIdent.find_by!(number: 3).update!(active: true)
    aired = @talk.tracks.find_by!(audio_file: "03-station-id-04.mp3")
    BroadcastSegment.create!(track: aired, starts_at: 1.hour.ago, ends_at: 1.hour.ago + 10)
    assert_equal "02-station-id-03.mp3", Interlude.station_id.audio_file
  end

  test "no talk built yet: the shows run straight on" do
    @talk.destroy!
    assert_nil Interlude.station_id
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
