# A listener who signed in with Google to make requests. Listening never needs one.
class User < ApplicationRecord
  has_many :song_requests, dependent: :destroy

  validates :google_uid, presence: true, uniqueness: true

  def first_name
    name.to_s.split.first.presence || "a listener"
  end

  def requests_left_today
    return SongRequest::DAILY_LIMIT if limit_exempt?

    [SongRequest::DAILY_LIMIT - song_requests.today.count, 0].max
  end

  # The station's own testers (REQUEST_LIMIT_EXEMPT, comma-separated emails)
  # never run out.
  def limit_exempt?
    ENV.fetch("REQUEST_LIMIT_EXEMPT", "").split(",").map { |e| e.strip.downcase }.include?(email.to_s.downcase)
  end
end
