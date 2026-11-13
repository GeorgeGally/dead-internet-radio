module Api
  module V1
    class TransmissionsController < ListenerController
      skip_forgery_protection only: :heart
      before_action :require_user, only: :create

      rate_limit to: 5, within: 1.minute, only: :create,
        with: -> { render json: { message: "Frequency busy. Try again shortly." }, status: :too_many_requests }
      rate_limit to: 20, within: 1.minute, only: :heart,
        with: -> { render json: { message: "Slow down." }, status: :too_many_requests }

      def index
        render json: Transmission.where("created_at > ?", 30.minutes.ago)
          .recent.limit(25).includes(:user).reverse.map(&:as_signal)
      end

      def create
        body = params[:body].to_s.gsub(/\s+/, " ").strip
        if body.blank? || body.length > 120 || body.match?(/https?:|www\.|[\r\n]/i) || RequestFilter.blocked?(body)
          return render json: { message: "That transmission doesn't belong on this frequency." }, status: :unprocessable_entity
        end
        if current_user.transmissions.where("created_at > ?", 8.seconds.ago).exists?
          return render json: { message: "Wait a moment before transmitting again." }, status: :too_many_requests
        end
        item = current_user.transmissions.create!(kind: "chat", body: body)
        render json: item.as_signal, status: :created
      end

      def heart
        ActionCable.server.broadcast("dir_signal", { type: "heart" })
        head :no_content
      end
    end
  end
end
