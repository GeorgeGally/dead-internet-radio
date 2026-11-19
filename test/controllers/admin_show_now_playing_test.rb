# frozen_string_literal: true

require "test_helper"

class AdminShowNowPlayingTest < ActionDispatch::IntegrationTest
  setup do
    @dir = Dir.mktmpdir
    @mix = Rails.root.join("mixes", "test-now-playing-#{Process.pid}.mp3")
    FileUtils.mkdir_p(@mix.dirname)
    File.write(@mix, "mix")
    show = Show.create!(slot: "night", name: "Now Playing Show", directory: @dir,
                        status: :complete, mix_file: @mix.basename.to_s)
    @first = show.tracks.create!(position: 1, artist: "Neon Hex", title: "Wire Kiss",
                                 duration_ms: 150_000, audio_file: "01-wire.mp3", cue_seconds: 0)
    @second = show.tracks.create!(position: 2, artist: "Violet Static", title: "Night Bus",
                                  duration_ms: 120_000, audio_file: "02-bus.mp3", cue_seconds: 150)
    File.write(File.join(@dir, "01-wire.mp3"), "wire")
    File.write(File.join(@dir, "02-bus.mp3"), "bus")
    @show = show
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  teardown do
    FileUtils.rm_rf(@dir)
    FileUtils.rm_f(@mix)
  end

  test "the show page has a now-playing label beside its mix audio" do
    get admin_show_path(@show)
    assert_response :success
    assert_select "audio.show-mix"
    assert_select "[data-now-playing]", text: "Press play to start the mix"
  end

  test "each track row carries what the player needs to name and follow it" do
    get admin_show_path(@show)
    assert_response :success
    assert_select "table.songs tr[data-track='#{@first.id}'][data-cue='0.0'][data-ms='150000'][data-now='Neon Hex — Wire Kiss']"
    assert_select "table.songs tr[data-track='#{@second.id}'][data-cue='150.0'][data-ms='120000'][data-now='Violet Static — Night Bus']"
  end
end
