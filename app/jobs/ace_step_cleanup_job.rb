class AceStepCleanupJob < ApplicationJob
  queue_as :default

  def perform
    # Crash residue (worker killed mid-job) must not hold the GPU forever.
    AceStepSession.stale.delete_all

    if AceStepSession.exists?
      Rails.logger.info "[AceStepCleanupJob] #{AceStepSession.count} active session(s) — skipping shutdown"
      return
    end

    Rails.logger.info "[AceStepCleanupJob] No active sessions — shutting down ACE-Step"
    AceStepManager.stop!
  end
end