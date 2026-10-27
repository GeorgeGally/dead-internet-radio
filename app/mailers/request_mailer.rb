# The one email a listener gets: when their request airs, in their own time.
class RequestMailer < ApplicationMailer
  def scheduled(request, starts_at)
    @request = request
    zone = ActiveSupport::TimeZone[request.time_zone.to_s] || ActiveSupport::TimeZone["UTC"]
    @at = starts_at.in_time_zone(zone)
    @zone = zone.tzinfo.name
    @url = ENV.fetch("APP_URL", "http://localhost:3000")
    mail to: request.user.email, subject: "#{request.title} airs #{@at.strftime('%a %H:%M')}"
  end
end
