# frozen_string_literal: true

module Admin
  class BaseController < ApplicationController
    layout "admin"
    before_action :require_admin
    before_action :claim_player_votes

    private

    def require_admin
      redirect_to admin_login_path unless session[:admin] == true
    end

    # This browser's thumbs from the public player are the station's.
    def claim_player_votes
      Vote.claim_for_station!(cookies.signed[:dir_voter])
    end
  end
end
