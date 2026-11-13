module Api
  module V1
    class SignalController < ApplicationController
      # The next actual hour from the station clock, not a six-track preview.
      def lineup
        now = Time.current
        Station.fill!(now)
        segments = BroadcastSegment.where(starts_at: now...(now + 1.hour))
          .chronological.includes(track: :show).limit(300)
        artists = segments.filter_map do |segment|
          track = segment.track
          next if track.artist.blank? || track.artist == Track::STATION_ARTIST
          next if track.show.kind == "interlude"

          track.artist
        end.uniq.first(3)
        render json: { artists: artists, generated_at: now.iso8601 }
      end

      # Instant: cached model-written lines or the built-in ones, never a live model call.
      def bulletins
        render json: { lines: FictionBulletins.current }
      end
    end
  end
end
