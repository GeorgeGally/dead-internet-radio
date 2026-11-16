# frozen_string_literal: true

module Admin
  class AudioIdentsController < Admin::BaseController
    def index
      @clips = StationIdent.sync_from_player!.select { |ident| ident.kind == "audio" }
      renders = IdentRender.where(station_ident_id: @clips.map(&:id)).index_by(&:station_ident_id)
      @clips.each { |clip| clip.association(:ident_render).target = renders[clip.id] }
      @waiting = IdentRender.where(preview: false, status: %i[queued rendering failed]).order(:id)
      @last = IdentRender.order(:id).last
    end

    def destroy
      ident = StationIdent.find_by!(id: params[:id], kind: "audio")
      ident.remove!
      redirect_to admin_audio_idents_path, status: :see_other
    end
  end
end
