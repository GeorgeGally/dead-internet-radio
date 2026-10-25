module Api
  module V1
    # Base for the endpoints that act as a signed-in listener. The player is a
    # static page on the same origin, so writes must be JSON, same-origin and
    # carry the CSRF token handed out by GET /api/v1/me.
    class ListenerController < ApplicationController
      before_action :require_json_same_origin, unless: -> { request.get? || request.head? }

      rescue_from ActionController::InvalidAuthenticityToken do
        render json: { message: "Stale line. Reload and try again." }, status: :forbidden
      end

      private

      def current_user
        @current_user ||= User.find_by(id: session[:user_id]) if session[:user_id]
      end

      def require_user
        render json: { message: "Sign in first." }, status: :unauthorized unless current_user
      end

      def require_json_same_origin
        origin = request.headers["Origin"]
        site = request.headers["Sec-Fetch-Site"]
        same = (origin.blank? || origin == request.base_url) && (site.blank? || site == "same-origin")
        return if same && request.media_type == "application/json"

        render json: { message: "Not from here." }, status: :forbidden
      end

      def me_json
        {
          signed_in: current_user.present?,
          name: current_user&.first_name,
          requests_left: current_user ? current_user.requests_left_today : SongRequest::DAILY_LIMIT,
          google_client_id: GoogleIdToken.client_id,
          csrf_token: form_authenticity_token,
        }
      end
    end
  end
end
