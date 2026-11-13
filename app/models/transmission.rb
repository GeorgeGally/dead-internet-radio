class Transmission < ApplicationRecord
  belongs_to :user, optional: true
  validates :kind, inclusion: { in: %w[chat request station] }
  validates :body, presence: true, length: { maximum: 240 }
  scope :recent, -> { order(created_at: :desc) }
  scope :visible, -> { where(hidden_at: nil) }

  after_create_commit :broadcast_signal
  after_update_commit :broadcast_removal, if: :saved_change_to_hidden_at?

  def as_signal
    { id: id, kind: kind, body: body, name: metadata["handle"] || user&.public_handle,
      metadata: metadata, created_at: created_at.iso8601 }
  end

  private

  def broadcast_removal
    return unless hidden_at.present?

    ActionCable.server.broadcast("dir_signal", { type: "remove", id: id })
  end

  def broadcast_signal
    ActionCable.server.broadcast("dir_signal", { type: "message", event: as_signal })
  end
end
