# frozen_string_literal: true

# A saved system prompt for one kind of writing in the pipeline (Music, Brief,
# Rewrite, DJ). One prompt per kind is active; generation reads it at job start.
# Each kind's "Original" is its seed file in prompts/, which stays the fallback
# when a prompt is empty or gives output the pipeline cannot read.
class MasterPrompt < ApplicationRecord
  KINDS = JSON.parse(Rails.root.join("prompts/master_prompts.json").read).freeze
  ORIGINAL = "Original"
  # Written whenever the library changes: generate.py reads it when a run names
  # no prompts of its own, and the generation PC is sent it with the catalog.
  ACTIVE_FILE = Rails.root.join(Rails.env.test? ? "tmp" : "output", "active-prompts.json")

  validates :kind, inclusion: { in: KINDS.keys }
  validates :name, presence: true, uniqueness: { scope: :kind }
  validates :body, presence: true

  before_save { self.version += 1 if persisted? && body_changed? }
  before_destroy { throw(:abort) if active? }
  after_commit { self.class.write_active! }

  scope :of, ->(kind) { where(kind: kind) }

  def self.label(kind) = KINDS.dig(kind, "label")

  def self.original_body(kind)
    Rails.root.join("prompts", KINDS.fetch(kind)["file"]).read.strip
  end

  # Each kind starts with its seed file as "Original", active.
  def self.ensure_seeded!
    KINDS.each_key do |kind|
      next if of(kind).exists?

      create!(kind: kind, name: ORIGINAL, body: original_body(kind), active: true,
              notes: "The prompt in prompts/#{KINDS[kind]['file']} when the library began.")
    rescue ActiveRecord::RecordNotUnique
      next
    end
  end

  def self.library(kind)
    ensure_seeded!
    of(kind).order(active: :desc, updated_at: :desc)
  end

  def self.active_for(kind) = of(kind).find_by(active: true)

  # {kind => {id, name, version, body}}: the chosen prompt per kind, else the
  # active one. What a job is generated with.
  def self.snapshot(choices = {})
    ensure_seeded!
    picked(choices)
  end

  def self.picked(choices = {})
    choices = (choices || {}).to_h.stringify_keys
    KINDS.keys.each_with_object({}) do |kind, out|
      prompt = (of(kind).find_by(id: choices[kind]) if choices[kind].present?) || active_for(kind)
      out[kind] = prompt.as_snapshot if prompt
    end
  end

  def self.write_active!
    FileUtils.mkdir_p(ACTIVE_FILE.dirname)
    tmp = ACTIVE_FILE.sub_ext(".json.tmp")
    tmp.write(JSON.pretty_generate("prompts" => picked))
    File.rename(tmp, ACTIVE_FILE)
  rescue SystemCallError => e
    Rails.logger.warn("MasterPrompt: could not write #{ACTIVE_FILE}: #{e.message}")
  end

  # The pipeline's slot, carrying its job's prompts (generate.py unwrap_slot).
  def self.wrap_slot(slot, prompts)
    prompts.present? ? "prompts #{ { slot: slot, prompts: prompts }.to_json }" : slot
  end

  # One line per kind for a job page: Music "Darker" v3.
  def self.describe(prompts)
    (prompts || {}).map { |kind, p| "#{label(kind) || kind} \"#{p['name']}\" v#{p['version']}" }.join(" · ")
  end

  def activate!
    transaction do
      self.class.of(kind).where.not(id: id).where(active: true).update_all(active: false, updated_at: Time.current)
      update!(active: true)
    end
  end

  def duplicate
    base = "#{name} copy"
    copy_name = base
    n = 1
    copy_name = "#{base} #{n += 1}" while self.class.of(kind).exists?(name: copy_name)
    self.class.create!(kind: kind, name: copy_name, body: body, notes: notes)
  end

  def keys = KINDS.dig(kind, "keys") || []

  # The words the pipeline reads from this kind's answers that the prompt no
  # longer names: saving still works, the editor warns.
  def missing_keys
    keys.reject { |key| body.to_s.match?(/(?<![A-Za-z0-9_])#{Regexp.escape(key)}(?![A-Za-z0-9_])/) }
  end

  def original? = name == ORIGINAL

  def as_snapshot = { "id" => id, "name" => name, "version" => version, "body" => body }
end
