# frozen_string_literal: true

module Admin
  class BaseController < ApplicationController
    include Admin::TrackJobsHelper

    layout "admin"
    before_action :require_admin
    before_action :claim_player_votes
    before_action :prevent_browser_caching

    rescue_from ActionController::InvalidAuthenticityToken do
      redirect_back fallback_location: admin_path,
                    notice: "This page was out of date. It has been refreshed; try again."
    end

    private

    def prevent_browser_caching
      response.headers["Cache-Control"] = "no-store"
    end

    def require_admin
      redirect_to admin_login_path unless session[:admin] == true
    end

    # This browser's thumbs from the public player are the station's.
    def claim_player_votes
      Vote.claim_for_station!(cookies.signed[:dir_voter])
    end
  end
end
