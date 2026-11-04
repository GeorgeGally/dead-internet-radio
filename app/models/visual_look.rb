# A saved look: the filter stack and dials one artwork slot opens with.
class VisualLook < ApplicationRecord
  SLOTS = (1..9).to_a.freeze
  SETTINGS = %w[fx filters cutoff resonance strength].freeze
  MAX_BYTES = 4.kilobytes

  validates :artwork, format: { with: /\A[\w-]{1,64}\z/ }
  validates :slot, inclusion: { in: SLOTS }
  validate :settings_are_a_look

  def settings=(value)
    super(value.is_a?(Hash) ? value.slice(*SETTINGS) : value)
  end

  # { "bouncy" => { 3 => settings } }, the shape the player keeps.
  def self.as_map
    order(:artwork, :slot).each_with_object({}) do |look, map|
      (map[look.artwork] ||= {})[look.slot] = look.settings
    end
  end

  # Adds looks without touching any already here. One that wants a taken slot
  # goes to the artwork's first free slot; with none free it's left out.
  def self.merge!(incoming)
    tally = { added: 0, moved: 0, present: 0, left_out: 0 }
    transaction do
      incoming.each do |artwork, slots|
        unless slots.is_a?(Hash)
          tally[:left_out] += 1
          next
        end
        held = where(artwork: artwork).index_by(&:slot)
        # Free slots first, so a moved look can't take the slot of a later one.
        slots.sort_by { |slot, _| held.key?(slot.to_i) ? 1 : 0 }.each do |slot, settings|
          look = new(artwork: artwork, slot: slot, settings: settings)
          outcome = place(look, held)
          held[look.slot] = look if %i[added moved].include?(outcome)
          tally[outcome] += 1
        end
      end
    end
    tally
  end

  def self.place(look, held)
    return :left_out unless look.valid?
    return :present if held.values.any? { |kept| kept.settings == look.settings }

    outcome = :added
    if held.key?(look.slot)
      look.slot = (SLOTS - held.keys).first
      return :left_out unless look.slot

      outcome = :moved
    end
    look.save!
    outcome
  end
  private_class_method :place

  private

  def settings_are_a_look
    return errors.add(:settings, "isn't a look") unless settings.is_a?(Hash) && settings.keys.intersect?(%w[fx filters])

    errors.add(:settings, "is too big") if settings.to_json.bytesize > MAX_BYTES
  end
end
