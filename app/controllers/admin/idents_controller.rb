# frozen_string_literal: true

module Admin
  class IdentsController < Admin::BaseController
    def index
      @idents = StationIdent.sync_from_player!.group_by(&:kind)
    end

    def update
      saved = StationIdent.find(params[:id]).update(params.expect(station_ident: [:active]))
      head(saved ? :no_content : :unprocessable_entity)
    end
  end
end
