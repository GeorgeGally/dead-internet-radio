class VisualModule < ApplicationRecord
  validates :slug, presence: true, uniqueness: true

  scope :active, -> { where(active: true) }

  # Player plumbing, not artworks.
  SUPPORT_SCRIPTS = %w[engine filters fx gallery].freeze

  KNOWN_NAMES = {
    "giphy" => "Giphy Feed",
    "blocks" => "Generative Blocks",
    "grid" => "Grid",
    "trail" => "Trail",
    "isocubes" => "Iso Cubes",
    "bouncy" => "Bouncy",
    "twirlz" => "Twirlz",
    "bubbles" => "Bubbles",
    "branches" => "Branches",
    "particle_drawings" => "Particle Drawings",
    "particle_machine" => "Particle Machine",
    "four_dots" => "Four Dots",
    "delayed_lerp_points2c" => "Delayed Lerp Points 2C",
    "delayed_lerp_points8" => "Delayed Lerp Points 8",
    "delayed_lerp_points7" => "Delayed Lerp Points 7",
    "delayed_lerp_points7b" => "Delayed Lerp Points 7B",
    "delayed_lerp_points_1600" => "Delayed Lerp Points 1600",
    "patterns2" => "Patterns 2",
    "wall_drawing_26" => "Wall Drawing 26",
    "self_avoiding_walk_3d" => "Self Avoiding Walk 3D",
    "cubes_token_sha" => "Cubes Token SHA",
    "led_grid" => "LED Grid Visual",
  }.freeze

  def self.registered_slugs
    Dir.glob(Rails.root.join("public/visuals/*.js"))
      .map { |path| File.basename(path, ".js") }
      .reject { |slug| SUPPORT_SCRIPTS.include?(slug) }
      .sort
  end

  # Every artwork the player can register needs a row to be switchable.
  def self.sync_from_player!
    registered_slugs.each do |slug|
      find_or_create_by!(slug: slug) do |visual|
        visual.name = KNOWN_NAMES[slug] || slug.humanize.titleize
      end
    end
  end
end
