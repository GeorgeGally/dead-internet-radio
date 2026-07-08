module Admin
  class AceStepController < Admin::BaseController
    def status
      @status = AceStepManager.status
      respond_to do |format|
        format.json { render json: @status }
        format.html { redirect_to admin_root_path }
      end
    end

    def toggle
      if AceStepManager.healthy?
        AceStepManager.stop!
      else
        AceStepManager.start!
      end
      redirect_to admin_root_path, notice: "ACE-Step #{AceStepManager.healthy? ? 'started' : 'stopped'}"
    end
  end
end