# frozen_string_literal: true

require "test_helper"

class ApiVotesTest < ActionDispatch::IntegrationTest
  setup do
    show = Show.create!(slot: "late night", directory: "vote-test-#{SecureRandom.hex(3)}", status: :complete)
    @song = show.tracks.create!(position: 1, artist: "Static Bloom", title: "Carrier Signal", duration_ms: 150_000)
    @opening = show.tracks.create!(position: 2, artist: Track::STATION_ARTIST, title: "Opening", duration_ms: 20_000)
  end

  test "a browser votes once per song and can change or take it back" do
    vote(@song, 1)
    assert_response :success
    vote(@song, 1)
    assert_equal [1, 0], counts

    vote(@song, -1)
    assert_equal [0, 1], counts

    vote(@song, 0)
    assert_equal [0, 0], counts
    assert_equal 0, Vote.count
  end

  test "a set's copy of a song is not the song" do
    copy = Show.create!(slot: "set", directory: "vote-set-#{SecureRandom.hex(3)}", status: :complete, kind: "set")
               .tracks.create!(position: 1, artist: @song.artist, title: @song.title, duration_ms: 150_000, origin_track: @song)
    assert_equal @song.id, copy.song_id
    vote(copy, 1)
    assert_response :not_found
    vote(@opening, 1)
    assert_response :not_found
  end

  test "votes must come from the station's own page" do
    post "/api/v1/songs/#{@song.id}/vote", params: { value: 1 }.to_json,
                                           headers: { "Content-Type" => "application/json", "Origin" => "https://evil.example" }
    assert_response :forbidden
    assert_equal [0, 0], counts
  end

  private

  def vote(track, value)
    post "/api/v1/songs/#{track.id}/vote", params: { value: value }.to_json, headers: { "Content-Type" => "application/json" }
  end

  def counts
    @song.reload
    [@song.up_votes, @song.down_votes]
  end
end
