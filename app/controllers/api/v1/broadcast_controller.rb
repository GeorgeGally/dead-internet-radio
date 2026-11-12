module Api
  module V1
    # The shared timeline: what's on air now and what's next.
    class BroadcastController < ApplicationController
      def show
        segments = Station.lineup.map(&:to_api)
        render json: { serverTime: (Time.current.to_f * 1000).round, segments: segments }
      end
    end
  end
end
