Rails.application.configure do
  config.solid_queue.connects_to = { database: { writing: :primary } }

  # Don't run the supervisor in development — use bin/jobs instead
end
