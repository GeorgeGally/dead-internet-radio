require "test_helper"

class ApiSignalLineupTest < ActionDispatch::IntegrationTest
  test "lineup looks through an hour, not just the next six segments" do
    show = Show.create!(slot: "signal test", directory: "signal-#{SecureRandom.hex(5)}")
    start = 10.minutes.from_now
    8.times do |i|
      artist = i == 7 ? "Last Hour Artist" : "Earlier Artist"
      track = Track.create!(show: show, position: i + 1, artist: artist,
        title: "Track #{i + 1}", duration_ms: 60_000)
      BroadcastSegment.create!(track: track,
        starts_at: start + (i * 5).minutes, ends_at: start + (i * 5).minutes + 1.minute)
    end
    stub(Station, :fill!, nil) { get "/api/v1/signal/lineup" }
    assert_response :success
    assert_includes response.parsed_body["artists"], "Last Hour Artist"
    assert_includes response.parsed_body["artists"], "Earlier Artist"
  end

  private

  def stub(mod, name, value)
    original = mod.method(name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.define_singleton_method(name, original)
  end
end
