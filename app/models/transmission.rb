class Transmission < ApplicationRecord
  belongs_to :user, optional: true
  validates :kind, inclusion: { in: %w[chat request station] }
  validates :body, presence: true, length: { maximum: 240 }
  scope :recent, -> { order(created_at: :desc) }

  after_create_commit :broadcast_signal

  def as_signal
    { id: id, kind: kind, body: body, name: user&.first_name,
      metadata: metadata, created_at: created_at.iso8601 }
  end

  private

  def broadcast_signal
    ActionCable.server.broadcast("dir_signal", { type: "message", event: as_signal })
  end
end
