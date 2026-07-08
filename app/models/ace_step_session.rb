class AceStepSession < ApplicationRecord
  scope :active, -> { where("last_activity_at > ?", 5.minutes.ago) }

  def touch_activity!
    update!(last_activity_at: Time.current)
  end
end