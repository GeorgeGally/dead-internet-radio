# frozen_string_literal: true

require "test_helper"

class RequestMailerTest < ActionMailer::TestCase
  test "submitted tells the station what was asked for, by whom, when, and where to find it" do
    user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe", email: "pat@example.com")
    req = user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", note: "colder",
                                     created_at: Time.utc(2026, 11, 6, 21, 40))

    mail = RequestMailer.submitted(req)

    assert_equal [ "g1+DIR@radarboy.com" ], mail.to
    assert_equal "Request: Carrier Signal by Static Bloom", mail.subject
    body = mail.body.to_s
    assert_includes body, %("Carrier Signal" by Static Bloom)
    assert_includes body, "colder"
    assert_includes body, "Pat Doe / pat@example.com"
    assert_includes body, "Friday 6 November at 21:40 UTC"
    assert_includes body, "/admin/requests#request-#{req.id}"
  end
end
