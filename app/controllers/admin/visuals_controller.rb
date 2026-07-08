# frozen_string_literal: true

module Admin
  class VisualsController < Admin::BaseController
    def index
      @visuals = VisualModule.order(:name)
    end

    def update
      @visual = VisualModule.find(params[:id])
      @visual.update(params.expect(visual_module: %i[name active thumbnail]))
      redirect_to admin_visuals_path, notice: 'Visual updated'
    end
  end
end
