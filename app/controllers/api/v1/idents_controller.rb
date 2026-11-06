module Api
  module V1
    class IdentsController < ApplicationController
      def index
        response.headers["Cache-Control"] = "no-store"
        render json: StationIdent.on_air
      end
    end
  end
end
