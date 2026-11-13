# Emergency switch in the shared Rails cache, plus a deployment kill switch.
module SignalControls
  CACHE_KEY = "dir:signal:chat_disabled"

  def self.chat_enabled?
    ENV.fetch("SIGNAL_CHAT_ENABLED", "true") != "false" &&
      ENV["OPENROUTER_API_KEY"].present? &&
      Rails.cache.read(CACHE_KEY) != true
  end

  def self.set_chat_enabled!(enabled)
    Rails.cache.write(CACHE_KEY, !enabled)
    ActionCable.server.broadcast("dir_signal", { type: "chat_state", enabled: chat_enabled? })
  end
end
