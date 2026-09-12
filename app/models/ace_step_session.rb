class AceStepSession < ApplicationRecord
  scope :active, -> { where(last_activity_at: 5.minutes.ago..) }
  scope :stale, -> { where(last_activity_at: ..10.minutes.ago) }

  # Non-raising so a session row deleted by stop! mid-job can't crash the job's ensure block.
  def touch_activity!
    update_columns(last_activity_at: Time.current)
  end
end