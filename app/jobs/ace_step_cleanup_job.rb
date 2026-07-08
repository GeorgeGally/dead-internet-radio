class AceStepCleanupJob < ApplicationJob
  queue_as :default

  def perform
    if AceStepSession.any?
      Rails.logger.info "[AceStepCleanupJob] #{AceStepSession.count} active session(s) — skipping shutdown"
      return
    end

    Rails.logger.info "[AceStepCleanupJob] No active sessions — shutting down ACE-Step"
    AceStepManager.stop!
  end
end