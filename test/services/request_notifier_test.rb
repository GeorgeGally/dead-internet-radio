# frozen_string_literal: true

require "test_helper"

class RequestNotifierTest < ActiveJob::TestCase
  include ActionMailer::TestHelper

  setup do
    @old_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe", email: "pat@example.com")
    req_show = Show.create!(slot: "request line", directory: "req-#{SecureRandom.hex(3)}", status: :complete, kind: "request")
    @song = req_show.tracks.create!(position: 1, artist: "Static Bloom", title: "Carrier Signal", duration_ms: 150_000)
    @req = user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", status: :ready, track: @song,
                                      time_zone: "Europe/Berlin")
    set = Show.create!(slot: "late night", directory: "set-#{SecureRandom.hex(3)}", status: :complete, kind: "set")
    @copy = set.tracks.create!(position: 1, artist: @song.artist, title: @song.title, duration_ms: 150_000, origin_track: @song)
  end

  teardown { ActiveJob::Base.queue_adapter = @old_adapter }

  test "a request waits for a set, then its listener gets one email with the time" do
    @copy.update!(origin_track: nil)
    assert_includes SongRequest.waiting_for_set.to_a, @req
    @copy.update!(origin_track: @song)
    refute_includes SongRequest.waiting_for_set.to_a, @req

    seg = BroadcastSegment.create!(track: @copy, starts_at: Time.utc(2026, 10, 27, 21, 40), ends_at: Time.utc(2026, 10, 27, 21, 42))
    assert_enqueued_emails 1 do
      RequestNotifier.scheduled!([seg])
    end
    assert_predicate @req.reload, :scheduled?

    mail = RequestMailer.scheduled(@req, seg.starts_at)
    assert_equal ["pat@example.com"], mail.to
    assert_equal "Carrier Signal airs Tue 22:40", mail.subject
    assert_includes mail.body.to_s, "Europe/Berlin"

    assert_no_enqueued_emails { RequestNotifier.scheduled!([seg]) }
  end

  test "request renders never air on their own" do
    refute_includes Show.airable.to_a, @song.show
  end
end
