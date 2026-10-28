Rails.application.configure do
  # Development keeps jobs in their own database (config/database.yml, queue)
  # and runs them in bin/jobs; everywhere else they share the primary.
  config.solid_queue.connects_to = { database: { writing: :primary } } unless Rails.env.development?
end
