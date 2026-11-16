class RequestMailer < ApplicationMailer
  STATION_INBOX = "g1+DIR@radarboy.com"
  CONCEPT_MAX = 220
  STAMP = "%Y%m%dT%H%M%SZ".freeze

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
    ends_at = starts_at + (song&.air_ms.to_i.positive? ? song.air_ms / 1000.0 : 4.minutes)
    @event = { title: "#{request.artist} — #{request.title} on Dead Internet Radio", starts_at: starts_at.utc,
               ends_at: ends_at.utc, details: "Listen: #{@url}" }
    @calendar_url = google_calendar_url(@event, @zone)
    attachments["dead-internet-radio.ics"] = { mime_type: "text/calendar; method=PUBLISH; charset=UTF-8",
                                               content: ics(@event, "request-#{request.id}") }
    mail to: request.user.email, subject: "#{request.title} airs #{@at.strftime('%a %H:%M')}"
  end

  private

  # Add-to-calendar for clients that don't open the .ics.
  def google_calendar_url(event, zone)
    "https://calendar.google.com/calendar/render?" + {
      action: "TEMPLATE", text: event[:title], details: event[:details], location: @url, ctz: zone,
      dates: "#{event[:starts_at].strftime(STAMP)}/#{event[:ends_at].strftime(STAMP)}"
    }.to_query
  end

  # One event, in UTC so every calendar places it right whatever its zone.
  def ics(event, uid)
    esc = ->(s) { s.to_s.gsub(/[\\;,]/) { |c| "\\#{c}" }.gsub(/\r?\n/, "\\n") }
    host = URI(@url).host.presence || "deadinternetradio"
    [ "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dead Internet Radio//Requests//EN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", "UID:#{uid}@#{host}", "DTSTAMP:#{Time.current.utc.strftime(STAMP)}",
      "DTSTART:#{event[:starts_at].strftime(STAMP)}", "DTEND:#{event[:ends_at].strftime(STAMP)}",
      "SUMMARY:#{esc.(event[:title])}", "DESCRIPTION:#{esc.(event[:details])}", "URL:#{@url}",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:#{esc.(event[:title])}", "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR" ].map { |line| fold(line) }.join("\r\n") + "\r\n"
  end

  # iCalendar lines stop at 75 octets; the rest carries on after a space.
  def fold(line)
    chunks = [ +"" ]
    line.each_char do |c|
      chunks << +" " if chunks.last.bytesize + c.bytesize > 75
      chunks.last << c
    end
    chunks.join("\r\n")
  end

  # The producer's idea, or the caption it was rendered from: a sentence or
  # two, cut at a word.
  def concept(text)
    text = text.to_s.squish
    return nil if text.empty?

    short = text.scan(/[^.!?]+[.!?]+(?:\s|\z)/).first(2).join.strip.presence || text
    short.length > CONCEPT_MAX ? short.truncate(CONCEPT_MAX, separator: " ", omission: "…") : short
  end
end
