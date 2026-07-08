module Api
  module V1
    class NowPlayingController < ApplicationController
      def show
        show = Show.completed.recent.first
        track = show&.tracks&.ordered&.first

        render json: {
          show: show ? { id: show.id, name: show.name, djName: show.dj_name } : nil,
          track: track ? {
            id: track.id,
            title: track.title,
            artist: track.artist,
            bpm: track.bpm,
            key: track.key,
            durationMs: track.duration_ms,
          } : nil,
          visual: nil,
          filter: nil,
        }
      end
    end
  end
end
