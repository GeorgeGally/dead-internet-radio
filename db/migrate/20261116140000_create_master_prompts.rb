# The admin's prompt library: saved system prompts per kind (prompts/master_prompts.json),
# one of them active. Each kind's "Original" is seeded from its file in prompts/.
class CreateMasterPrompts < ActiveRecord::Migration[8.0]
  def change
    create_table :master_prompts do |t|
      t.string :kind, null: false
      t.string :name, null: false
      t.text :body, null: false
      t.text :notes
      t.boolean :active, default: false, null: false
      t.integer :version, default: 1, null: false
      t.timestamps
    end
    add_index :master_prompts, %i[kind name], unique: true
    add_index :master_prompts, :kind, unique: true, where: "active", name: "index_master_prompts_one_active_per_kind"
  end
end
