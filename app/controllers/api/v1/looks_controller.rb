module Api
  module V1
    # The saved looks every listener's player opens with. Reading is public;
    # only a signed-in admin can change them.
    class LooksController < ListenerController
      before_action :require_admin, except: :index

      def index
        no_store
        render json: { looks: VisualLook.as_map, admin: admin?, csrf_token: (form_authenticity_token if admin?) }.compact
      end

      def update
        look = VisualLook.find_or_initialize_by(artwork: params[:artwork], slot: params[:slot])
        look.settings = body["look"]
        if look.save
          render json: { artwork: look.artwork, slot: look.slot, look: look.settings }
        else
          render json: { message: look.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end
      end

      def destroy
        VisualLook.where(artwork: params[:artwork], slot: params[:slot]).destroy_all
        head :no_content
      end

      def merge
        looks = body["looks"]
        return render json: { message: "That's not a set of looks." }, status: :unprocessable_entity unless looks.is_a?(Hash)

        render json: VisualLook.merge!(looks).merge(looks: VisualLook.as_map)
      end

      private

      def admin?
        session[:admin] == true
      end

      def require_admin
        render json: { message: "Admin only." }, status: :forbidden unless admin?
      end

      # Read raw: Rails strips nulls from JSON arrays in params, and an empty
      # filter row is [null, false, 0.5, 0.5].
      def body
        @body ||= JSON.parse(request.raw_post)
      rescue JSON::ParserError
        @body = {}
      end
    end
  end
end
