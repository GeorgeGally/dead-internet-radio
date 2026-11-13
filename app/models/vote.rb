# One listener's thumbs on one song. Listeners are browsers: a signed cookie,
# no sign-in. Counters on the song keep the library page and set builder cheap.
# The station's own vote (voter "admin") also lands on the song as
# station_vote: it weighs more, and its dislike keeps the song off air.
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
      Track.where(id: song.id).update_all(station_vote: value) if voter == ADMIN
    end
    Station.drop_upcoming(song.id) if voter == ADMIN && value == -1
    song.reload
  end

  # The player is public, so the admin's thumbs there can arrive as a
  # listener's. Once that browser is signed in to the admin, its votes become
  # the station's; where the station already voted, the later vote wins.
  def self.claim_for_station!(voter)
    return if voter.blank? || voter == ADMIN

    where(voter: voter).includes(:track).find_each do |vote|
      station = find_by(track_id: vote.track_id, voter: ADMIN)
      cast!(vote.track, voter, 0)
      cast!(vote.track, ADMIN, vote.value) unless station && station.updated_at > vote.updated_at
    end
  end
end
