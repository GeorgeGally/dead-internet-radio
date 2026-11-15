# frozen_string_literal: true

require "test_helper"

class SongHomeTest < ActiveSupport::TestCase
  setup do
    BroadcastSegment.delete_all
    @show = Show.create!(slot: "late night", directory: "late-night-#{SecureRandom.hex(4)}", status: :complete)
    @songs = (1..3).map { |i| Track.create!(show: @show, position: i, artist: "Null Choir", title: "Song #{i}", duration_ms: 180_000) }
  end

  test "a booked request joins the show it airs in, after the song it follows" do
    request = one_song_show("request")
    BroadcastSegment.create!(track: @songs[0], starts_at: 1.minute.ago, ends_at: 2.minutes.from_now)
    seg = BroadcastSegment.create!(track: request, source: "request", starts_at: 2.minutes.from_now, ends_at: 5.minutes.from_now)
    folder = request.show.directory

    SongHome.settle_request!(request, seg)

    assert_equal [ @show.id, 2, folder ], [ request.show_id, request.position, request.folder ]
    assert_equal [ 1, 3, 4 ], @songs.map { |t| t.reload.position }
    refute Show.exists?(directory: folder)
    assert_equal request, seg.reload.track
  end

  test "between shows a request opens the next show" do
    request = one_song_show("request")
    ident = one_song_show("interlude")
    BroadcastSegment.create!(track: ident, starts_at: 1.minute.ago, ends_at: 1.minute.from_now)
    seg = BroadcastSegment.create!(track: request, source: "request", starts_at: 1.minute.from_now, ends_at: 4.minutes.from_now)
    BroadcastSegment.create!(track: @songs[0], starts_at: 4.minutes.from_now, ends_at: 7.minutes.from_now)

    SongHome.settle_request!(request, seg)

    assert_equal [ @show.id, 1 ], [ request.show_id, request.position ]
  end

  test "a remix joins its song's show as a take, out of the running order" do
    take = one_song_show("remix")
    job = GenerationJob.create!(slot: "remix", status: :done, options: { "kind" => "remix", "track_id" => @songs[1].id })

    assert_equal @show, SongHome.settle_take!(job, take.show)

    take.reload
    assert_equal [ @show.id, 4, true ], [ take.show_id, take.position, take.take ]
    assert_equal @songs, @show.tracks.running.ordered.to_a
    assert_equal take, job.reload.take_track
    assert_equal @songs[1], SongTakes.original(take)
    assert_includes SongTakes.for(@songs[1]).map(&:song), take
  end

  test "folding old one-song shows is a dry run until applied" do
    request = one_song_show("request")
    BroadcastSegment.create!(track: @songs[2], starts_at: 2.hours.ago, ends_at: 117.minutes.ago)
    BroadcastSegment.create!(track: request, source: "request", starts_at: 117.minutes.ago, ends_at: 114.minutes.ago)
    take = one_song_show("remix")
    GenerationJob.create!(slot: "remix", status: :done, show: take.show, options: { "kind" => "remix", "track_id" => request.id })

    lines = SongHome.fold_all!
    assert_equal 2, lines.size
    assert_equal "request", request.reload.show.kind

    SongHome.fold_all!(apply: true)
    assert_equal [ @show.id, 4 ], [ request.reload.show_id, request.position ]
    assert_equal [ @show.id, true ], [ take.reload.show_id, take.take ]
    assert_empty Show.where(kind: %w[request remix])
  end

  private

  def one_song_show(kind)
    show = Show.create!(slot: kind, kind: kind, directory: "#{kind}-#{SecureRandom.hex(4)}", status: :complete)
    Track.create!(show: show, position: 1, artist: "Static Bloom", title: "Carrier Signal", duration_ms: 180_000)
  end
end
