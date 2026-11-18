# Jobs send the library's active prompts, not the files in prompts/, and each
# kind's "Original" row still holds its prompt from when the library began.
# The rewritten Music (dj.md), Rewrite (rerender.md) and Brief (producer.md)
# prompts go in as "Darkroom" and become the ones in use; every earlier prompt
# stays in the library to switch back to.
class ActivateDarkroomPrompts < ActiveRecord::Migration[8.0]
  NAME = "Darkroom"
  KINDS = %w[music rewrite brief].freeze

  def up
    MasterPrompt.reset_column_information
    MasterPrompt.ensure_seeded!
    KINDS.each do |kind|
      prompt = MasterPrompt.of(kind).find_by(name: NAME) ||
               MasterPrompt.create!(kind: kind, name: NAME, body: MasterPrompt.original_body(kind),
                                    notes: "prompts/#{MasterPrompt::KINDS.dig(kind, 'file')} as rewritten against cheesy club sounds (2026-11-18).")
      prompt.activate!
    end
  end

  def down
    KINDS.each { |kind| MasterPrompt.of(kind).find_by(name: MasterPrompt::ORIGINAL)&.activate! }
  end
end
