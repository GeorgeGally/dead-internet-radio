# frozen_string_literal: true

module Admin
  class VisualsController < Admin::BaseController
    def index
      VisualModule.sync_from_player!
      @visuals = VisualModule.order(:name)
    end

    def update
      @visual = VisualModule.find(params[:id])
      @visual.update(params.expect(visual_module: %i[name active thumbnail]))
      respond_to do |format|
        format.html { redirect_to admin_visuals_path, notice: 'Visual updated' }
        format.json { head :no_content }
      end
    end
  end
end
