module Api
  module V1
    # Thumbs up or down on the song on air. No sign-in: a listener is a browser,
    # known by a signed cookie. Same-origin JSON is the forgery guard here, as
    # there's no session token to hand out.
    class VotesController < ListenerController
      skip_forgery_protection
      rate_limit to: 30, within: 1.minute, with: -> { render json: { message: "Easy." }, status: :too_many_requests }

      def create
        song = Track.songs.find_by(id: params[:song_id])
        return render json: { message: "No such song." }, status: :not_found unless song

        value = params[:value].to_i.clamp(-1, 1)
        song = Vote.cast!(song, voter, value)
        render json: { song_id: song.id, vote: value, up: song.up_votes, down: song.down_votes }
      end

      private

      def voter
        cookies.signed[:dir_voter].presence || SecureRandom.uuid.tap do |id|
          cookies.signed[:dir_voter] = { value: id, expires: 10.years, httponly: true, same_site: :lax }
        end
      end
    end
  end
end
