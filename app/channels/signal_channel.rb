class SignalChannel < ApplicationCable::Channel
  def subscribed
    stream_from "dir_signal"
  end
end
