# frozen_string_literal: true

require "test_helper"

# A dislike from the station (the admin) keeps a song off air for good, like a
# veto; listener dislikes count as before, and the station's vote weighs more.
class StationDislikeTest < ActiveSupport::TestCase
  setup do
    @root = Dir.mktmpdir
    BroadcastSegment.delete_all
    @show = make_show("show", "show", "01-bad.mp3", "02-good.mp3")
    @bad, @good = @show.tracks.ordered.to_a
    @set = make_show("set", "set", "01-bad-copy.mp3", "02-good-copy.mp3")
    @set.tracks.ordered.first.update!(origin_track: @bad)
    @set.tracks.ordered.second.update!(origin_track: @good)
  end

  teardown { FileUtils.rm_rf(@root) }

  def make_show(name, kind, *files)
    dir = File.join(@root, name)
    FileUtils.mkdir_p(dir)
    show = Show.create!(slot: "night", directory: dir, status: :complete, kind: kind, name: name)
    files.each_with_index do |file, index|
      File.write(File.join(dir, file), "x")
      show.tracks.create!(position: index + 1, title: file, artist: "Someone", duration_ms: 60_000, audio_file: file)
    end
    show
  end

  def aired_song_ids
    BroadcastSegment.includes(:track).map { |seg| seg.track.song_id }
  end

  test "a song the station disliked is never picked or aired" do
    Vote.cast!(@bad, Vote::ADMIN, -1)

    assert @bad.reload.kept_out?
    refute_includes Library.pool.map { |c| c[:id] }, @bad.id
    other = make_show("other", "set", "01-good-copy.mp3")
    other.tracks.first.update!(origin_track: @good)
    refute_includes SetSwap.candidates(other.tracks.first).map(&:id), @bad.id
    refute_includes Track.not_vetoed, @bad
    assert_includes Track.kept_out, @bad

    Station.fill!
    ids = aired_song_ids
    assert_includes ids, @good.id
    refute_includes ids, @bad.id, "neither the song's own show nor a set's copy of it airs"
  end

  test "a show left with no song sits out" do
    alone = make_show("alone", "show", "01-only.mp3")
    only = alone.tracks.first
    Vote.cast!(only, Vote::ADMIN, -1)
    Station.fill!
    refute BroadcastSegment.joins(:track).where(tracks: { show_id: alone.id }).exists?
  end

  test "a station dislike takes the song's bookings ahead off the timeline" do
    Station.fill!
    booked = BroadcastSegment.chronological.to_a
    assert(booked.any? { |seg| seg.track.song_id == @bad.id && seg.starts_at > Time.current })
    span = booked.last.ends_at - booked.first.starts_at

    Vote.cast!(@bad, Vote::ADMIN, -1)

    left = BroadcastSegment.chronological.includes(:track).to_a
    refute(left.any? { |seg| seg.track.song_id == @bad.id && seg.starts_at > Time.current })
    left.each_cons(2) { |a, b| assert_in_delta a.ends_at, b.starts_at, 1, "the gap closes" }
    assert_operator left.last.ends_at - left.first.starts_at, :<, span
  end

  test "taking the station's dislike back brings the song back" do
    Vote.cast!(@bad, Vote::ADMIN, -1)
    Vote.cast!(@bad, Vote::ADMIN, 0)
    refute @bad.reload.kept_out?
    assert_includes Library.pool.map { |c| c[:id] }, @bad.id
  end

  test "a listener's dislike counts normally and does not keep a song out" do
    Vote.cast!(@bad, "listener-1", -1)
    refute @bad.reload.kept_out?
    assert_equal(-1, @bad.score)
    assert_includes Library.pool.map { |c| c[:id] }, @bad.id

    %w[listener-2 listener-3].each { |v| Vote.cast!(@bad, v, -1) }
    assert @bad.reload.retired?
    refute_includes Library.pool.map { |c| c[:id] }, @bad.id
  end

  test "the station's vote weighs more than a listener's" do
    Vote.cast!(@good, Vote::ADMIN, 1)
    Vote.cast!(@good, "listener-1", -1)
    @good.reload
    assert_equal [1, 1], [@good.up_votes, @good.down_votes]
    assert_equal Track::STATION_WEIGHT - 1, @good.score

    %w[listener-2 listener-3].each { |v| Vote.cast!(@good, v, -1) }
    refute @good.reload.retired?, "three listener dislikes don't outvote the station's like"
  end

  test "a browser's votes become the station's" do
    Vote.cast!(@bad, "george-browser", -1)
    Vote.cast!(@good, "george-browser", 1)
    Vote.claim_for_station!("george-browser")

    assert_equal 0, Vote.where(voter: "george-browser").count
    assert_equal(-1, @bad.reload.station_vote)
    assert_equal [0, 1], [@bad.up_votes, @bad.down_votes]
    assert_equal 1, @good.reload.station_vote
    assert @bad.kept_out?
  end
end
