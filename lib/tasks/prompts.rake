# frozen_string_literal: true

namespace :prompts do
  desc "Seed each kind's Original master prompt from prompts/ and write output/active-prompts.json"
  task seed: :environment do
    MasterPrompt.ensure_seeded!
    MasterPrompt.write_active!
    MasterPrompt::KINDS.each_key do |kind|
      active = MasterPrompt.active_for(kind)
      puts "#{MasterPrompt.label(kind)}: #{active.name} v#{active.version}"
    end
  end
end
