module Admin
  class AceStepController < Admin::BaseController
    def status
      @status = AceStepManager.status.merge(installed: AceStepManager.installed?)
      @status[:waiting] = GenerationLine.waiting.length unless @status[:installed]
      respond_to do |format|
        format.json { render json: @status }
        format.html { redirect_to admin_path }
      end
    end

    def toggle
      if AceStepManager.healthy?
        AceStepManager.stop!
      else
        AceStepManager.start!
      end
      redirect_to admin_path, notice: "ACE-Step #{AceStepManager.healthy? ? 'started' : 'stopped'}"
    end
  end
end