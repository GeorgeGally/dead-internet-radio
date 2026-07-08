# frozen_string_literal: true

module Admin
  class BaseController < ApplicationController
    layout 'admin'
    before_action :require_admin

    private

    def require_admin
      redirect_to admin_login_path unless session[:admin] == true
    end
  end
end
