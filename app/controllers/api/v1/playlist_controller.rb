module Api
  module V1
    class PlaylistController < ApplicationController
      def show
        show = Show.completed.recent.first
        unless show
          return render json: { epoch: Time.now.to_i * 1000, tracks: [] }
        end

        tracks = show.tracks.ordered.map { |t|
          {
            file: "/media/tracks/#{t.id}",
            durationMs: t.duration_ms,
            title: t.title,
            artist: t.artist,
            caption: t.caption,
            bpm: t.bpm,
            key: t.key,
            voiceoverFile: t.voiceover_file.present? ? "/media/tracks/#{t.id}/voiceover" : nil,
          }
        }

        render json: {
          epoch: (show.generated_at || show.created_at).to_i * 1000,
          showName: show.name,
          djName: show.dj_name,
          tracks: tracks,
        }
      end
    end
  end
end
