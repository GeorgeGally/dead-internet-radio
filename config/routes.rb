Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :shows, only: [:index, :show]
      resources :tracks, only: [:show]
      resources :visuals, only: [:index]
      get "playlist", to: "playlist#show"
      get "now_playing", to: "now_playing#show"
      get "broadcast", to: "broadcast#show"

      get "me", to: "sessions#me"
      post "session/google", to: "sessions#google"
      delete "session", to: "sessions#destroy"
      resources :requests, only: [:index, :create]
      post "songs/:song_id/vote", to: "votes#create", as: :song_vote
    end
  end

  # archive.org films proxied same-origin so canvas filters keep working.
  get "broll/:item/*file", to: "broll#show", format: false, as: :broll

  # Audio streamed off disk from DB-linked paths (no blobs in DB).
  get "media/tracks/:id", to: "media#track", as: :media_track
  get "media/tracks/:id/voiceover", to: "media#voiceover", as: :media_track_voiceover
  get "media/shows/:id/mix", to: "media#mix", as: :media_show_mix

  namespace :admin do
    get "/", to: "dashboard#index"
    resources :shows, only: [:index, :show, :destroy] do
      member do
        post :remix
        post :reimport
      end
    end
    get "schedule", to: "schedule#index", as: :schedule
    resources :tracks, only: [:destroy] do
      post :rerender, on: :member
    end
    resources :library, only: [:index] do
      post :veto, on: :member
      post :build, on: :collection
    end
    resources :requests, only: [:index] do
      post :fulfill, on: :member
    end
    resources :visuals, only: [:index, :update]
    resources :generation, only: [:index, :new, :create, :show] do
      member do
        post :retry
        get :progress
        get "file/*file_path", to: "generation#output", as: :output_file
      end
    end
    post "build_site", to: "dashboard#build_site", as: :build_site
    get "login", to: "sessions#new"
    post "login", to: "sessions#create"
    delete "logout", to: "sessions#destroy"

    get "ace_step/status", to: "ace_step#status", as: :ace_step_status
    post "ace_step/toggle", to: "ace_step#toggle", as: :ace_step_toggle
  end

  # root serves static public/index.html (the player)
end
