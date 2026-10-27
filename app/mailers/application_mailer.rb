class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Dead Internet Radio <radio@localhost>") }
end
