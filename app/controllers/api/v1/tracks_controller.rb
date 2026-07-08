module Api
  module V1
    class TracksController < ApplicationController
      def show
        track = Track.includes(:show).find(params[:id])
        render json: {
          id: track.id,
          show_id: track.show_id,
          show_name: track.show&.name,
          position: track.position,
          title: track.title,
          artist: track.artist,
          caption: track.caption,
          bpm: track.bpm,
          key: track.key,
          duration_ms: track.duration_ms,
          audio_file: track.audio_file,
          voiceover_file: track.voiceover_file,
          script: track.script,
          lyrics: track.lyrics,
          brief: track.brief,
          artwork_url: track.artwork_url,
        }
      end
    end
  end
end
