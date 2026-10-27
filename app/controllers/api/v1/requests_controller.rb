module Api
  module V1
    # The request line. Every attempt counts toward the day's three, rejected
    # or not, so the filter can't be probed for free. Naming a real band (a
    # cover) is the one mistake that gives the turn back.
    class RequestsController < ListenerController
      before_action :require_user

      def index
        requests = current_user.song_requests.recent.limit(20)
        render json: requests.map { |r| request_json(r) }
      end

      def create
        req = current_user.song_requests.new(params.slice(:artist, :title, :note).permit(:artist, :title, :note).to_h)
        # The listener's own clock, for the "it airs at" email.
        req.time_zone = params[:time_zone] if ActiveSupport::TimeZone[params[:time_zone].to_s]
        unless req.valid?
          blank = req.errors.any? { |e| e.type == :blank }
          return render json: { status: "invalid", message: blank ? "Artist and title. Both." : "Shorter. The line is thin." },
                        status: :unprocessable_entity
        end

        # Lock the listener's row so two quick sends can't both take the last one.
        saved = current_user.with_lock { current_user.requests_left_today.positive? && req.save! }
        unless saved
          return render json: { status: "rejected", message: "That's three today. The line opens again tomorrow.", requests_left: 0 },
                        status: :too_many_requests
        end

        verdict = RequestFilter.check(artist: req.artist, title: req.title, note: req.note)
        if verdict.cover?
          # Naming a real band is a mistake, not abuse: the turn comes back.
          req.destroy!
          return render json: { status: "cover", message: verdict.reason, requests_left: current_user.requests_left_today },
                        status: :ok
        elsif verdict.accepted?
          req.update!(status: :queued, matched_track: SongRequest.match_artist(req.artist))
        else
          req.update!(status: :rejected, rejection_reason: verdict.reason)
        end

        render json: request_json(req).merge(message: verdict.accepted? ? "Logged. When it's on the schedule, we'll email you the time." : verdict.reason,
                                             requests_left: current_user.requests_left_today),
               status: :created
      end

      private

      def request_json(req)
        { id: req.id, artist: req.artist, title: req.title, note: req.note, status: req.status,
          reason: req.rejection_reason, track_id: req.track_id, created_at: req.created_at }
      end
    end
  end
end
