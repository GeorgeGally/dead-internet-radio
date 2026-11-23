# One station ID line voiced by Kokoro (announce.py) from /admin/audio_idents:
# the words, the voice and the effect settings it went through. A preview's
# audio stays in tmp/ident-renders; a kept render becomes the next clip in
# public/station-ids, off air until it's switched on.
class IdentRender < ApplicationRecord
  KOKORO = Rails.root.join("kokoro/.venv/bin/python3")
  ANNOUNCE = Rails.root.join("announce.py")
  DIR = Rails.root.join("tmp/ident-renders")

  # The Kokoro voices generate_station_ids.py draws from.
  VOICES = %w[
    bm_lewis bm_daniel bm_fable bm_george
    bf_emma bf_isabella bf_alice bf_lily
    am_adam am_michael am_fenrir am_onyx am_echo am_puck am_eric am_liam am_santa
    af_bella af_nicole af_sarah af_sky af_aoede af_kore af_nova af_heart af_alloy af_jessica af_river
  ].freeze

  # Each knob, its announce.py flag, its range and where it starts (announce.py's
  # own defaults, so an untouched render sounds like the station's other talk).
  KNOBS = {
    "speed" => { flag: "--speed", min: 0.5, max: 1.5, step: 0.05, default: 1.0 },
    "lofi" => { flag: "--intensity", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    "reverb" => { flag: "--reverb", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    "delay" => { flag: "--delay-mix", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    "vocoder" => { flag: "--vocoder-mix", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
  }.freeze
  DEFAULTS = KNOBS.transform_values { |knob| knob[:default] }.merge("telephone" => false).freeze

  belongs_to :station_ident, optional: true

  enum :status, { queued: 0, rendering: 1, done: 2, failed: 3 }

  validates :text, presence: true, length: { maximum: 300 }
  validates :voice, inclusion: { in: VOICES }

  before_validation :clamp_settings

  def self.kokoro?
    KOKORO.exist?
  end

  def self.purge_old_previews
    where(preview: true, station_ident_id: nil).where(created_at: ...1.hour.ago).find_each do |old|
      FileUtils.rm_f(old.path)
      old.destroy
    end
  end

  def path
    DIR.join("#{id}.wav")
  end

  def command
    knobs = KNOBS.map { |name, knob| "#{knob[:flag]}=#{settings.fetch(name)}" }
    cmd = [KOKORO.to_s, ANNOUNCE.to_s, "--text=#{text}", "--output=#{path}", "--voice=#{voice}", "--delay-ms=110", *knobs]
    cmd << (settings["telephone"] ? "--phone" : "--no-phone")
  end

  # The rendered take goes on the station's list as the next clip, off air.
  def keep!
    transaction do
      ident = StationIdent.create!(kind: "audio", number: StationIdent.next_audio_number, active: false)
      update!(station_ident: ident)
      FileUtils.mv(path, ident.clip_path)
    end
  end

  private

  def clamp_settings
    given = settings.to_h.stringify_keys
    self.settings = DEFAULTS.to_h do |name, default|
      next [name, ActiveModel::Type::Boolean.new.cast(given.fetch(name, default)) || false] if name == "telephone"

      knob = KNOBS.fetch(name)
      value = Float(given.fetch(name, default), exception: false) || default
      [name, value.clamp(knob[:min], knob[:max]).round(2)]
    end
  end
end
