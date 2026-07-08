# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_07_04_032945) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ace_step_sessions", force: :cascade do |t|
    t.string "job_type", null: false
    t.bigint "job_id"
    t.datetime "last_activity_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["last_activity_at"], name: "index_ace_step_sessions_on_last_activity_at"
  end

  create_table "generation_jobs", force: :cascade do |t|
    t.string "slot", null: false
    t.integer "track_count", default: 4
    t.integer "status", default: 0
    t.text "output_log"
    t.bigint "show_id"
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "options"
    t.index ["show_id"], name: "index_generation_jobs_on_show_id"
    t.index ["status"], name: "index_generation_jobs_on_status"
  end

  create_table "shows", force: :cascade do |t|
    t.string "slot", null: false
    t.string "name"
    t.string "dj_name"
    t.integer "track_count", default: 4
    t.string "directory"
    t.string "mix_file"
    t.integer "status", default: 0
    t.datetime "generated_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["directory"], name: "index_shows_on_directory", unique: true
    t.index ["status"], name: "index_shows_on_status"
  end

  create_table "tracks", force: :cascade do |t|
    t.bigint "show_id", null: false
    t.integer "position", null: false
    t.string "title"
    t.string "artist"
    t.text "caption"
    t.integer "bpm"
    t.string "key"
    t.integer "duration_ms"
    t.string "audio_file"
    t.string "voiceover_file"
    t.text "script"
    t.text "lyrics"
    t.text "brief"
    t.string "frequency_band"
    t.string "modulation_type"
    t.string "signal_path"
    t.string "artwork_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.float "cue_seconds"
    t.index ["show_id", "position"], name: "index_tracks_on_show_id_and_position", unique: true
    t.index ["show_id"], name: "index_tracks_on_show_id"
  end

  create_table "visual_modules", force: :cascade do |t|
    t.string "slug", null: false
    t.string "name"
    t.text "thumbnail"
    t.boolean "active", default: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_visual_modules_on_slug", unique: true
  end

  add_foreign_key "generation_jobs", "shows"
  add_foreign_key "tracks", "shows"
end
