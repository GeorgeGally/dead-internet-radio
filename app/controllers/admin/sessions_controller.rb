# frozen_string_literal: true

module Admin
  class SessionsController < ApplicationController
    layout 'login'

    def new
      redirect_to admin_path if logged_in?
    end

    def create
      username = ENV.fetch('ADMIN_USERNAME', 'admin')
      password = ENV.fetch('ADMIN_PASSWORD', 'deadinternet')

      if params[:username] == username && params[:password] == password
        session[:admin] = true
        redirect_to admin_path
      else
        @error = 'Invalid credentials'
        render :new, status: :unprocessable_entity
      end
    end

    def destroy
      session.delete(:admin)
      redirect_to admin_login_path
    end

    private

    def logged_in?
      session[:admin] == true
    end
  end
end
