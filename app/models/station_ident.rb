# One ident the player can air: a version of the station ident lab (visual) or
# a clip in public/station-ids (audio). The files say what exists; the row says
# whether it's on.
class StationIdent < ApplicationRecord
  LAB = Rails.root.join("public/labs/station-ident-lab.html")
  CLIPS = Rails.root.join("public/station-ids")
  # Off until someone turns them on: V5 (X-Y oscilloscope), V7 (radar), V11
  # (round amber oscilloscope), V12 (spectrogram), V21 (cassette).
  RETIRED = [5, 7, 11, 12, 21].freeze

  CLIP_NAMES = {
    1 => "0321.9 kilohertz",
    2 => "All systems operational",
    3 => "D.I.R. The signal never sleeps",
    4 => "D.I.R. The last transmission",
    5 => "Dead internet on your dial",
    6 => "Dead internet on your dial, take 2",
    7 => "Dead Internet Radio, 0321.9",
    8 => "Dead Internet Radio, 0321.9 kilohertz",
    10 => "Dead Internet Radio broadcast",
    11 => "Dead Internet Radio. No one is",
    12 => "Dead Internet Radio. Still on",
    13 => "Dead Internet Radio. The last",
    14 => "Dead Internet Radio. The machines",
  }.freeze

  attr_accessor :name

  # A clip voiced at /admin/audio_idents keeps what was said, by whom and how.
  has_one :ident_render, dependent: :nullify

  validates :kind, inclusion: { in: %w[visual audio] }
  validates :number, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: :kind }

  def self.catalogue
    visual = LAB.read.scan(/^  name: '(.+?)',/).flatten.each_with_index.map do |name, index|
      { kind: "visual", number: index + 1, name: name }
    end
    said = IdentRender.joins(:station_ident).pluck("station_idents.number", :text).to_h
    audio = Dir.glob(clips_dir.join("id-*.wav")).map { |path| File.basename(path)[/\d+/].to_i }.sort.map do |number|
      { kind: "audio", number: number, name: said[number] || CLIP_NAMES.fetch(number, "Clip #{number}") }
    end
    visual + audio
  end

  # Every ident the player can air needs a row to be switchable. A removed
  # clip keeps its row, off, so a file that comes back stays gone.
  def self.sync_from_player!
    rows = all.index_by { |row| [row.kind, row.number] }
    catalogue.filter_map do |entry|
      row = rows[entry.values_at(:kind, :number)] || create_or_find_by!(entry.slice(:kind, :number)) do |fresh|
        fresh.active = !(entry[:kind] == "visual" && RETIRED.include?(entry[:number]))
      end
      next if row.removed

      row.name = entry[:name]
      row
    end
  end

  def self.clips_dir
    CLIPS
  end

  def self.clip_file(number)
    "id-#{number.to_s.rjust(2, '0')}.wav"
  end

  # Above every clip there is or was, so a new clip never takes an old one's
  # number (the player and the between-shows interludes go by number).
  def self.next_audio_number
    on_disk = Dir.glob(clips_dir.join("id-*.wav")).map { |path| File.basename(path)[/\d+/].to_i }
    [*on_disk, where(kind: "audio").maximum(:number).to_i].max + 1
  end

  # { visual: [1, 2], audio: [3] }, the shape the player reads.
  def self.on_air
    on = sync_from_player!.select(&:active)
    %w[visual audio].to_h { |kind| [kind, on.select { |row| row.kind == kind }.map(&:number)] }
  end

  def src
    kind == "audio" ? "/station-ids/#{self.class.clip_file(number)}" : "/labs/station-ident-lab.html?only=#{number}&once"
  end

  def clip_path
    self.class.clips_dir.join(self.class.clip_file(number))
  end

  # Off air and off the list. A voiced clip's file goes too; a shipped clip's
  # file is in the repo and would only come back with the next deploy.
  def remove!
    update!(active: false, removed: true)
    clip_path.delete if ident_render && clip_path.exist?
  end
end
