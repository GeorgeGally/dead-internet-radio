class CreateAceStepSessions < ActiveRecord::Migration[8.0]
  def change
    create_table :ace_step_sessions do |t|
      t.string :job_type, null: false
      t.bigint :job_id
      t.datetime :last_activity_at
      t.timestamps
    end

    add_index :ace_step_sessions, :last_activity_at
  end
end
