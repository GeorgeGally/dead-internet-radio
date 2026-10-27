# Listener emails go out over plain SMTP from the station's own domain (any
# host's mailbox works: DreamHost is smtp.dreamhost.com, port 587). Without
# SMTP_ADDRESS, mail is written to tmp/mails instead of sent.
Rails.application.configure do
  if ENV["SMTP_ADDRESS"].present?
    config.action_mailer.delivery_method = :smtp
    config.action_mailer.smtp_settings = {
      address: ENV["SMTP_ADDRESS"],
      port: ENV.fetch("SMTP_PORT", "587").to_i,
      user_name: ENV["SMTP_USERNAME"],
      password: ENV["SMTP_PASSWORD"],
      authentication: :plain,
      enable_starttls_auto: true,
    }
  elsif Rails.env.test?
    config.action_mailer.delivery_method = :test
  else
    config.action_mailer.delivery_method = :file
    config.action_mailer.file_settings = { location: Rails.root.join("tmp/mails") }
  end
  config.action_mailer.raise_delivery_errors = true
end
