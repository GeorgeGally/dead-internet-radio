# Preview at /rails/mailers/request_mailer.
class RequestMailerPreview < ActionMailer::Preview
  def scheduled
    user = User.new(name: "Pat Doe", email: "pat@example.com")
    track = Track.new(artist: "Static Bloom", title: "Carrier Signal", key: "A minor", bpm: 124,
                      idea: "A pirate transmitter left on in a flooded mall, still keeping time for escalators nobody rides.")
    req = SongRequest.new(id: 1, user: user, artist: "Static Bloom", title: "Carrier Signal", track: track,
                          time_zone: "Europe/Berlin")
    RequestMailer.scheduled(req, 2.hours.from_now)
  end

  def submitted
    user = User.new(name: "Pat Doe", email: "pat@example.com")
    RequestMailer.submitted(SongRequest.new(id: 1, user: user, artist: "Static Bloom", title: "Carrier Signal",
                                            note: "colder", created_at: Time.current))
  end
end
