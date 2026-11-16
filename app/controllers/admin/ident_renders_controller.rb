# frozen_string_literal: true

module Admin
  class IdentRendersController < Admin::BaseController
    def create
      render_row = IdentRender.new(params.expect(ident_render: [:text, :voice, :preview, { settings: {} }]))
      if render_row.save
        RenderIdentJob.perform_later(render_row.id)
        render json: state(render_row), status: :created
      else
        render json: { error: render_row.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    def show
      render json: state(IdentRender.find(params[:id]))
    end

    def audio
      path = IdentRender.find(params[:id]).path
      return head :not_found unless path.exist?

      send_file path, type: "audio/wav", disposition: "inline"
    end

    # A failed or stuck line comes off the list; a kept clip goes through its ident.
    def destroy
      row = IdentRender.find_by!(id: params[:id], station_ident_id: nil)
      row.path.delete if row.path.exist?
      row.destroy!
      redirect_to admin_audio_idents_path, status: :see_other
    end

    private

    def state(row)
      { id: row.id, status: row.status, preview: row.preview, error: row.error,
        audio: (audio_admin_ident_render_path(row) if row.done? && row.preview) }
    end
  end
end
