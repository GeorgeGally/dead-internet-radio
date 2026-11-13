module Api
  module V1
    class TransmissionsController < ListenerController
      skip_forgery_protection only: :heart
      before_action :require_user, only: :create

      rate_limit to: 5, within: 1.minute, only: :create, name: "signal_chat",
        by: -> { current_user&.id || request.remote_ip },
        with: -> { render json: { message: "Frequency busy. Try again shortly." }, status: :too_many_requests }
      rate_limit to: 20, within: 1.minute, only: :heart, name: "signal_heart",
        with: -> { render json: { message: "Slow down." }, status: :too_many_requests }

      def index
        render json: {
          chat_enabled: SignalControls.chat_enabled?,
          messages: Transmission.visible.where("created_at > ?", 30.minutes.ago)
            .recent.limit(25).includes(:user).reverse.map(&:as_signal)
        }
      end

      def create
        return render json: { message: "The chat frequency is off air." }, status: :service_unavailable unless SignalControls.chat_enabled?
        if current_user.signal_muted?
          return render json: { message: "Your transmission line is temporarily muted." }, status: :forbidden
        end
        body = params[:body].to_s.gsub(/\s+/, " ").strip
        case SignalFilter.check(body)
        when :rejected
          return render json: { message: "That transmission doesn't belong on this frequency." }, status: :unprocessable_entity
        when :unavailable
          return render json: { message: "The chat frequency is temporarily down." }, status: :service_unavailable
        end

        # Serialize sends by this user, preventing rapid concurrent duplicates.
        item = nil
        current_user.with_lock do
          if !SignalControls.chat_enabled? || current_user.signal_muted?
            return render json: { message: "The transmission line is unavailable." }, status: :service_unavailable
          end
          if current_user.transmissions.where(kind: "chat").where("created_at > ?", 8.seconds.ago).exists?
            return render json: { message: "Wait a moment before transmitting again." }, status: :too_many_requests
          end
          item = current_user.transmissions.create!(kind: "chat", body: body,
            metadata: { handle: current_user.public_handle })
        end
        render json: item.as_signal, status: :created
      end

      def heart
        ActionCable.server.broadcast("dir_signal", { type: "heart" })
        head :no_content
      end
    end
  end
end
