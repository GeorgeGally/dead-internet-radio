class CreateVisualModules < ActiveRecord::Migration[8.0]
  def change
    create_table :visual_modules do |t|
      t.string :slug, null: false
      t.string :name
      t.text :thumbnail
      t.boolean :active, default: true

      t.timestamps
    end
    add_index :visual_modules, :slug, unique: true
  end
end
