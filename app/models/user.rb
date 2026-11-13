# A listener who signed in with Google to make requests. Listening never needs one.
class User < ApplicationRecord
  has_many :song_requests, dependent: :destroy
  has_many :transmissions, dependent: :nullify

  validates :google_uid, presence: true, uniqueness: true
  validates :signal_handle, uniqueness: true, allow_nil: true

  # Public identity never includes the Google account's real name or email.
  def public_handle
    signal_handle.presence || assign_signal_handle!
  end

  # A coarse city label comes from the existing browser IP-city lookup, not
  # device location. An initial Somewhere handle is upgraded once, then sticks.
  def assign_signal_handle!(city: nil)
    prefix = self.class.signal_city(city) || "Somewhere"
    with_lock do
      if signal_handle.blank? || (signal_handle.start_with?("Somewhere_") && prefix != "Somewhere")
        original_suffix = signal_handle&.match(/_(\d+)\z/)&.captures&.first
        20.times do |attempt|
          suffix = attempt.zero? && original_suffix ? original_suffix : (100 + SecureRandom.random_number(9900)).to_s
          candidate = "#{prefix}_#{suffix}"
          next if User.where(signal_handle: candidate).where.not(id: id).exists?

          update!(signal_handle: candidate)
          break
        end
      end
    end
    signal_handle.presence || "Somewhere"
  end

  def signal_muted?
    signal_muted_until.present? && signal_muted_until.future?
  end

  def self.signal_city(raw)
    city = ActiveSupport::Inflector.transliterate(raw.to_s[0, 64]).gsub(/[^a-zA-Z ]/, " ").squish.tr(" ", "_")[0, 24]
    city = city.split("_").map(&:capitalize).join("_")
    reserved = %w[Admin Moderator DIR Station System Safety Alert Radio]
    city.presence unless reserved.any? { |name| name.casecmp?(city) }
  rescue ArgumentError
    nil
  end

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
