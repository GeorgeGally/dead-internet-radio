module Api
  module V1
    class NowPlayingController < ApplicationController
      def show
        segment = Station.lineup(limit: 1).first
        track = segment&.track
        show = track&.show

        render json: {
          show: show ? { id: show.id, name: show.name, djName: show.dj_name } : nil,
          track: track ? {
            id: track.id,
            title: track.title,
            artist: track.artist,
            bpm: track.bpm,
            key: track.key,
            durationMs: track.duration_ms,
            startsAt: (segment.starts_at.to_f * 1000).round,
          } : nil,
          visual: nil,
          filter: nil,
        }
      end
    end
  end
end
