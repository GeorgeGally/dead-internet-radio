# frozen_string_literal: true

require "test_helper"

class AdminShowPlayerTest < ActionDispatch::IntegrationTest
  setup do
    @root = Dir.mktmpdir
    dir = File.join(@root, "morning")
    FileUtils.mkdir_p(dir)
    @show = Show.create!(slot: "morning", name: "Dawn Concrete Exhale", directory: dir, status: :complete, kind: "set")
    @first = @show.tracks.create!(position: 1, artist: "Radar Prime", title: "Vaulted Cellar Count", duration_ms: 10_000, audio_file: "01.mp3")
    @second = @show.tracks.create!(position: 2, artist: "Coat Check Ghost", title: "Vaulted Coal Cellar", duration_ms: 20_000, audio_file: "02.mp3", cue_seconds: 12.5)
    @silent = @show.tracks.create!(position: 3, artist: "Missing", title: "No File", duration_ms: 5_000, audio_file: "03.mp3")
    File.write(File.join(dir, "01.mp3"), "one")
    File.write(File.join(dir, "02.mp3"), "two")

    mix_dir = File.join(@root, "mixed")
    FileUtils.mkdir_p(mix_dir)
    @mix = Rails.root.join("mixes", "test-show-player-#{Process.pid}.mp3")
    FileUtils.mkdir_p(@mix.dirname)
    File.write(@mix, "mix")
    @mixed = Show.create!(slot: "night", name: "Mixed", directory: mix_dir, status: :complete, mix_file: @mix.basename.to_s)
    @mixed.tracks.create!(position: 1, artist: "Band", title: "Song", duration_ms: 30_000, audio_file: "01.mp3")
    File.write(File.join(mix_dir, "01.mp3"), "song")

    @empty = Show.create!(slot: "late", name: "Empty", directory: File.join(@root, "empty"), status: :complete)
    FileUtils.mkdir_p(@empty.directory)

    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  teardown do
    FileUtils.rm_rf(@root)
    FileUtils.rm_f(@mix)
  end

  test "a show without a mix plays its tracks in order" do
    get admin_show_path(@show)
    assert_response :success
    assert_select "audio.show-mix", 0
    assert_select "[data-show-player] [data-show-play]"
    assert_select "[data-show-bar]"
    assert_select "[data-show-time]"
    assert_select "script[src*='admin-show-player.js']"
    assert_select ".show-actions"
    assert response.body.index("show-player") < response.body.index("show-actions")

    sources = JSON.parse(css_select("script#show-player-sources").first.text)
    assert_equal [ @first.id, @second.id ], sources.map { |s| s["id"] }
    assert_equal [ 10_000, 20_000 ], sources.map { |s| s["ms"] }
    assert_equal [ media_track_path(@first), media_track_path(@second) ], sources.map { |s| s["src"] }
  end

  test "a show with a mix plays that file" do
    get admin_show_path(@mixed)
    assert_response :success
    assert_select "audio.show-mix", 0
    sources = JSON.parse(css_select("script#show-player-sources").first.text)
    assert_equal [ { "src" => media_show_mix_path(@mixed) } ], sources
  end

  test "a show with no audio has no player" do
    get admin_show_path(@empty)
    assert_response :success
    assert_select "[data-show-player]", 0
    assert_select "audio", 0
    assert_select ".show-actions"
  end
end
