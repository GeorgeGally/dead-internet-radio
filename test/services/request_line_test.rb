# frozen_string_literal: true

require "test_helper"

class RequestLineTest < ActiveJob::TestCase
  include ActionMailer::TestHelper

  setup do
    BroadcastSegment.delete_all
    SongRequest.delete_all
    @user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe", email: "pat@example.com")
    @req = @user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", note: "colder", status: :accepted)
  end

  test "hands over what is waiting, oldest first, one line each" do
    later = @user.song_requests.create!(artist: "Null Choir", title: "Second", status: :accepted)
    @user.song_requests.create!(artist: "Held", title: "Back", status: :queued)

    lines = RequestLine.waiting
    assert_equal [@req.id, later.id], lines.map { |l| l.split(" ", 2).first.to_i }
    spec = JSON.parse(lines.first.split(" ", 2).last)
    assert_equal({ "requester" => "Pat", "artist" => "Static Bloom", "title" => "Carrier Signal",
                   "note" => "colder", "seed_caption" => nil }, spec)
  end

  test "walks the line and repeats safely" do
    RequestLine.mark!(@req.id, "queued")
    assert_predicate @req.reload, :queued?
    assert_empty RequestLine.waiting

    RequestLine.mark!(@req.id, "queued")
    RequestLine.mark!(@req.id, "generating")
    RequestLine.mark!(@req.id, "generating")
    assert_predicate @req.reload, :generating?

    RequestLine.mark!(@req.id, "failed")
    assert_predicate @req.reload, :failed?
  end

  test "done links the song, puts it on after the current one and emails the time" do
    show, track = rendered_show
    on_air = on_air_now
    @req.queued!

    assert_enqueued_emails 1 do
      RequestLine.mark!(@req.id, "done", show.directory)
    end

    @req.reload
    assert_predicate @req, :scheduled?
    assert_equal track, @req.track
    seg = BroadcastSegment.find_by!(track: track)
    assert_equal "request", seg.source
    assert_in_delta on_air.ends_at, seg.starts_at, 0.001

    assert_no_enqueued_emails { RequestLine.mark!(@req.id, "done", show.directory) }
    assert_equal 1, BroadcastSegment.where(track: track).count
  end

  test "a finished request can't be moved back" do
    @req.update!(status: :scheduled)
    RequestLine.mark!(@req.id, "failed")
    assert_predicate @req.reload, :scheduled?
  end

  test "a gone request is ignored and a made-up state refused" do
    assert_nil RequestLine.mark!(0, "done", "nowhere")
    assert_raises(ArgumentError) { RequestLine.mark!(@req.id, "bogus") }
  end

  private

  def rendered_show
    show = Show.create!(slot: "request line", directory: "request-line-#{SecureRandom.hex(4)}", kind: "request")
    [show, Track.create!(show: show, position: 1, artist: "Static Bloom", title: "Carrier Signal", duration_ms: 180_000)]
  end

  def on_air_now
    show = Show.create!(slot: "test", directory: "test-#{SecureRandom.hex(4)}")
    track = Track.create!(show: show, position: 1, artist: "A", title: "B", duration_ms: 240_000)
    BroadcastSegment.create!(track: track, starts_at: 1.minute.ago, ends_at: 3.minutes.from_now)
  end
end
