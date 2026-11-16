# A station ID line voiced from /admin/audio_idents: what was said, by which
# voice, through which effects. A preview stays in tmp/; a kept one becomes a
# clip in public/station-ids and its StationIdent row.
class CreateIdentRenders < ActiveRecord::Migration[8.0]
  def change
    create_table :ident_renders do |t|
      t.text :text, null: false
      t.string :voice, null: false
      t.jsonb :settings, default: {}, null: false
      t.integer :status, default: 0, null: false
      t.boolean :preview, default: false, null: false
      t.text :error
      t.references :station_ident, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_column :station_idents, :removed, :boolean, default: false, null: false
  end
end
