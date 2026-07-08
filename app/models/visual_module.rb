class VisualModule < ApplicationRecord
  validates :slug, presence: true, uniqueness: true

  scope :active, -> { where(active: true) }
end
