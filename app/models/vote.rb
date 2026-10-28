# One listener's thumbs on one song. Listeners are browsers: a signed cookie,
# no sign-in. Counters on the song keep the library page and set builder cheap.
class Vote < ApplicationRecord
  ADMIN = "admin"  # the station's own votes, from the admin
  belongs_to :track

  validates :voter, presence: true
  validates :value, inclusion: { in: [-1, 1] }

  # Sets value (1, -1, or 0 to take the vote back) and returns the song.
  def self.cast!(song, voter, value)
    transaction do
      vote = song.votes.lock.find_or_initialize_by(voter: voter)
      before = vote.persisted? ? vote.value : 0
      if value.zero?
        vote.destroy! if vote.persisted?
      else
        vote.update!(value: value)
      end
      up = (value == 1 ? 1 : 0) - (before == 1 ? 1 : 0)
      down = (value == -1 ? 1 : 0) - (before == -1 ? 1 : 0)
      Track.update_counters(song.id, up_votes: up, down_votes: down) if up != 0 || down != 0
    end
    song.reload
  end
end
