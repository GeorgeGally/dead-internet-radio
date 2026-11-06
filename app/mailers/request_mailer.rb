class RequestMailer < ApplicationMailer
  STATION_INBOX = "g1+DIR@radarboy.com"

  # Tells the station a listener's request has been accepted.
  def submitted(request)
    @request = request
    @url = "#{ENV.fetch('APP_URL', 'http://localhost:3000')}/admin/requests#request-#{request.id}"
    mail to: STATION_INBOX, subject: "Request: #{request.title} by #{request.artist}"
  end

  # The one email a listener gets: when their request airs, in their own time.
  def scheduled(request, starts_at)
    @request = request
    zone = ActiveSupport::TimeZone[request.time_zone.to_s] || ActiveSupport::TimeZone["UTC"]
    @at = starts_at.in_time_zone(zone)
    @zone = zone.tzinfo.name
    @url = ENV.fetch("APP_URL", "http://localhost:3000")
    mail to: request.user.email, subject: "#{request.title} airs #{@at.strftime('%a %H:%M')}"
  end
end
