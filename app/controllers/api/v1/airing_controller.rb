module Api
  module V1
    # The set on air, start to finish, for the player's set page.
    class AiringController < ApplicationController
      def show
        segments = Station.airing
        set = segments.map(&:track).find { |t| t.show.kind != "request" && t.show.kind != "interlude" }&.show
        render json: {
          serverTime: (Time.current.to_f * 1000).round,
          show: set ? { id: set.id, name: set.name, djName: set.dj_name } : nil,
          segments: segments.map(&:to_api),
        }
      end
    end
  end
end
