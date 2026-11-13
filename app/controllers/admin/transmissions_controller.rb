module Admin
  class TransmissionsController < Admin::BaseController
    def index
      @transmissions = Transmission.recent.includes(:user).limit(200)
      @chat_enabled = SignalControls.chat_enabled?
    end

    def hide
      transmission = Transmission.find(params[:id])
      transmission.update!(hidden_at: Time.current) unless transmission.hidden_at?
      redirect_to admin_transmissions_path, notice: "Transmission removed."
    end

    def mute
      transmission = Transmission.find(params[:id])
      user = transmission.user
      return redirect_to admin_transmissions_path, alert: "Listener no longer exists." unless user

      user.update!(signal_muted_until: 1.day.from_now)
      Transmission.visible.where(user: user, kind: "chat").order(created_at: :desc).limit(100).each do |message|
        message.update!(hidden_at: Time.current)
      end
      redirect_to admin_transmissions_path, notice: "#{user.public_handle} muted for 24 hours."
    end

    def unmute
      user = Transmission.find(params[:id]).user
      user&.update!(signal_muted_until: nil)
      redirect_to admin_transmissions_path, notice: "Listener unmuted."
    end

    def toggle_chat
      SignalControls.set_chat_enabled!(!SignalControls.chat_enabled?)
      redirect_to admin_transmissions_path, notice: "Signal chat updated."
    end
  end
end
