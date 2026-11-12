module Api
  module V1
    # The set on air, start to finish, for the player's set page.
    class AiringController < ApplicationController
      def show
        segments = Station.airing
        render json: {
          serverTime: (Time.current.to_f * 1000).round,
          segments: segments.map(&:to_api),
        }
      end
    end
  end
end
