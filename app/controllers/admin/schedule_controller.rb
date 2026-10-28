# frozen_string_literal: true

module Admin
  # What's on now and what's coming, show by show, out to the station's horizon.
  class ScheduleController < Admin::BaseController
    def index
      now = Time.current
      Station.fill!(now)
      segments = BroadcastSegment.upcoming(now).includes(track: [:show, { origin_track: :show }]).to_a
      @now = now
      @blocks = segments.chunk_while { |a, b| a.track.show_id == b.track.show_id }.to_a
      requested = SongRequest.where(track_id: segments.map { |s| s.track.song_id }).includes(:user)
      @requests = requested.index_by(&:track_id)
    end
  end
end
