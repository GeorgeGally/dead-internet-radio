class CreateGenerationJobs < ActiveRecord::Migration[8.0]
  def change
    create_table :generation_jobs do |t|
      t.string :slot, null: false
      t.integer :track_count, default: 4
      t.integer :status, default: 0
      t.text :output_log
      t.references :show, foreign_key: true
      t.datetime :started_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :generation_jobs, :status
  end
end
