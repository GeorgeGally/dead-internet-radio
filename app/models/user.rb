# A listener who signed in with Google to make requests. Listening never needs one.
class User < ApplicationRecord
  has_many :song_requests, dependent: :destroy

  validates :google_uid, presence: true, uniqueness: true

  def first_name
    name.to_s.split.first.presence || "a listener"
  end

  def requests_left_today
    [SongRequest::DAILY_LIMIT - song_requests.today.count, 0].max
  end
end
