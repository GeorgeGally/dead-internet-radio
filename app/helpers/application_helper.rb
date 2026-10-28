module ApplicationHelper
  # 154 -> "2:34"; blank for nothing.
  def mmss(seconds)
    return "" if seconds.blank?

    s = seconds.to_f.round
    format("%d:%02d", s / 60, s % 60)
  end

  # An artist's name, linked to their page (the station itself isn't an artist).
  def artist_link(name)
    return name if name.blank? || name == Track::STATION_ARTIST

    link_to name, admin_artist_path(name: name), class: "artist-link"
  end

  # A time the browser shows in the viewer's own zone (the admin layout's
  # script rewrites it); "time" shows only the clock, "datetime" the day too.
  def local_time(at, format: "datetime")
    return "" if at.blank?

    tag.time(at.utc.strftime("%Y-%m-%d %H:%M"), datetime: at.utc.iso8601, data: { local: format })
  end
end
