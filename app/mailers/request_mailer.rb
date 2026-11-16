class RequestMailer < ApplicationMailer
  STATION_INBOX = "g1+DIR@radarboy.com"
  CONCEPT_MAX = 220

  # Tells the station a listener's request has been accepted.
  def submitted(request)
    @request = request
    @url = "#{ENV.fetch('APP_URL', 'http://localhost:3000')}/admin/requests#request-#{request.id}"
    mail to: STATION_INBOX, subject: "Request: #{request.title} by #{request.artist}"
  end

  # The one email a listener gets: when their request airs, in their own time,
  # with what the station made of it (key, tempo, the idea behind the song).
  def scheduled(request, starts_at)
    @request = request
    zone = ActiveSupport::TimeZone[request.time_zone.to_s] || ActiveSupport::TimeZone["UTC"]
    @at = starts_at.in_time_zone(zone)
    @zone = zone.tzinfo.name
    @url = ENV.fetch("APP_URL", "http://localhost:3000")
    song = request.track&.song
    payload = song ? song.prompt_log.fetch("payload", {}) : {}
    @key = song&.key.presence || payload["keyscale"].presence
    @bpm = song&.bpm.presence || payload["bpm"].presence
    @concept = concept(song&.idea.presence || payload["caption"])
    mail to: request.user.email, subject: "#{request.title} airs #{@at.strftime('%a %H:%M')}"
  end

  private

  # The producer's idea, or the caption it was rendered from: a sentence or
  # two, cut at a word.
  def concept(text)
    text = text.to_s.squish
    return nil if text.empty?

    short = text.scan(/[^.!?]+[.!?]+(?:\s|\z)/).first(2).join.strip.presence || text
    short.length > CONCEPT_MAX ? short.truncate(CONCEPT_MAX, separator: " ", omission: "…") : short
  end
end
