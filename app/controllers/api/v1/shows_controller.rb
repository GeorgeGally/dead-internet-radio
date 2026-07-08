module Api
  module V1
    class ShowsController < ApplicationController
      def index
        shows = Show.completed.recent
        render json: shows.map { |s|
          {
            id: s.id,
            name: s.name,
            djName: s.dj_name,
            slot: s.slot,
            trackCount: s.track_count,
            directory: s.directory,
            mixFile: s.mix_file,
            generatedAt: s.generated_at,
            createdAt: s.created_at,
          }
        }
      end

      def show
        show = Show.completed.find(params[:id])
        tracks = show.tracks.ordered.map { |t|
          {
            id: t.id,
            position: t.position,
            title: t.title,
            artist: t.artist,
            caption: t.caption,
            bpm: t.bpm,
            key: t.key,
            durationMs: t.duration_ms,
            file: "/media/tracks/#{t.id}",
            voiceoverFile: t.voiceover_file.present? ? "/media/tracks/#{t.id}/voiceover" : nil,
            artworkUrl: t.artwork_url,
          }
        }
        render json: {
          id: show.id,
          name: show.name,
          djName: show.dj_name,
          slot: show.slot,
          trackCount: show.track_count,
          directory: show.directory,
          mixFile: show.mix_file.present? ? "/media/shows/#{show.id}/mix" : nil,
          generatedAt: show.generated_at,
          tracks: tracks,
        }
      end
    end
  end
end
