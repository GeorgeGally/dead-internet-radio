module Api
  module V1
    # Google sign-in for listeners, asked only when they make a request.
    class SessionsController < ListenerController
      def me
        render json: me_json
      end

      def google
        claims = GoogleIdToken.verify(params[:credential])
        return render json: { message: "Google didn't vouch for that." }, status: :unauthorized unless claims

        user = User.find_or_initialize_by(google_uid: claims["sub"])
        user.update!(email: claims["email"], name: claims["name"].presence || claims["given_name"])
        session[:user_id] = user.id
        @current_user = user
        render json: me_json
      end

      def destroy
        session.delete(:user_id)
        @current_user = nil
        render json: me_json
      end
    end
  end
end
