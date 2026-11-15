# frozen_string_literal: true

require "test_helper"

class AdminLibraryGenreTest < ActionDispatch::IntegrationTest
  setup do
    @dir = Dir.mktmpdir
    FileUtils.mkdir_p(File.join(@dir, "prompts"))
    show = Show.create!(slot: "night", directory: @dir, status: :complete)
    show.tracks.create!(position: 1, artist: "Neon Hex", title: "Wire Kiss", duration_ms: 200_000, audio_file: "01-wire-kiss.mp3")
    File.write(File.join(@dir, "prompts", "01-wire-kiss.prompt.json"),
               JSON.generate(payload: { caption: "Aggressive electroclash, 128 BPM in C minor. Overdriven 808." }))
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  teardown { FileUtils.rm_rf(@dir) }

  test "the library names each song's genre and its columns sort" do
    get admin_library_index_path
    assert_response :success
    assert_select "table.songs.sortable th", text: "Genre"
    assert_select "table.songs.sortable td", text: "Aggressive electroclash"
  end

  test "a caption that does not open with a genre has none" do
    song = Track.new(caption: nil)
    song.define_singleton_method(:sound_caption) { "Wavering 8-bit synth arpeggios in D minor, mimicking corrupt data" }
    assert_nil song.genre
  end
end
