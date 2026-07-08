module Api
  module V1
    class VisualsController < ApplicationController
      def index
        visuals = VisualModule.active.order(:name)
        render json: visuals.map { |v|
          {
            id: v.id,
            slug: v.slug,
            name: v.name,
            thumbnail: v.thumbnail.present? ? v.thumbnail : nil,
          }
        }
      end
    end
  end
end
