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

  test "scheduled leads with the song, then when it airs, its key, tempo and idea" do
    user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe", email: "pat@example.com")
    show = Show.create!(slot: "night", status: :complete)
    track = show.tracks.create!(position: 1, artist: "Static Bloom", title: "Carrier Signal", key: "A minor", bpm: 124,
                                idea: "A pirate transmitter left on in a flooded mall. The escalators still keep time.")
    req = user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", track: track, time_zone: "Europe/Berlin")

    mail = RequestMailer.scheduled(req, Time.utc(2026, 11, 6, 20, 40))

    assert_equal [ "pat@example.com" ], mail.to
    assert_equal "Carrier Signal airs Fri 21:40", mail.subject
    html = mail.html_part.body.to_s
    assert_operator html.index("Carrier Signal"), :<, html.index("A minor")
    [ "Static Bloom", "Fri 6 Nov · 21:40", "Europe/Berlin", "A minor", "124",
      "A pirate transmitter left on in a flooded mall.", %(href="http://localhost:3000") ].each do |part|
      assert_includes html, part
    end
    assert_includes html, "Dead Internet Radio"
    assert_includes html, "calendar.google.com/calendar/render?"
    assert_includes html, "dates=20261106T204000Z%2F20261106T204400Z"
    assert_includes html, "ctz=Europe%2FBerlin"

    ics = mail.attachments["dead-internet-radio.ics"]
    assert_equal "text/calendar", ics.mime_type
    cal = ics.decoded.gsub(/\r?\n /, "")
    assert_includes cal, "METHOD:PUBLISH"
    assert_includes cal, "DTSTART:20261106T204000Z"
    assert_includes cal, "DTEND:20261106T204400Z"
    assert_includes cal, "SUMMARY:Static Bloom — Carrier Signal on Dead Internet Radio"
    assert_includes cal, "URL:http://localhost:3000"
    assert ics.decoded.split(/\r?\n/).all? { |line| line.bytesize <= 75 }

    text = mail.text_part.body.to_s
    assert_includes text, "Remind me: https://calendar.google.com/"
    assert_includes text, "Key   A minor"
    assert_includes text, "BPM   124"
    assert_includes text, "Listen: http://localhost:3000"
  end

  test "scheduled falls back to the prompt log, and leaves out what the song doesn't have" do
    slug = "mailer-#{SecureRandom.hex(4)}"
    dir = Rails.root.join("output", slug, "prompts")
    FileUtils.mkdir_p(dir)
    File.write(dir.join("01-carrier.prompt.json"), JSON.generate(payload: {
      caption: "Cold electro at 128 BPM. A 303 loses its way in the fog. Then a third sentence that never shows.", bpm: 128 }))
    user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", email: "pat@example.com")
    show = Show.create!(slot: "night", directory: slug, status: :complete)
    track = show.tracks.create!(position: 1, artist: "Static Bloom", title: "Carrier Signal", audio_file: "01-carrier.mp3")
    req = user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", track: track)

    mail = RequestMailer.scheduled(req, Time.utc(2026, 11, 6, 20, 40))

    html = mail.html_part.body.to_s
    assert_includes html, "Cold electro at 128 BPM. A 303 loses its way in the fog."
    assert_not_includes html, "third sentence"
    assert_includes html, ">128<"
    assert_not_includes html, ">Key<"
    assert_not_includes mail.text_part.body.to_s, "Key"
  ensure
    FileUtils.rm_rf(Rails.root.join("output", slug)) if slug
  end
end
