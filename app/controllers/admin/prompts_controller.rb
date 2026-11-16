# frozen_string_literal: true

module Admin
  # The prompt library: saved system prompts per kind, one active per kind.
  class PromptsController < Admin::BaseController
    before_action { MasterPrompt.ensure_seeded! }
    before_action :set_prompt, only: %i[edit update destroy activate duplicate]

    def index
      @kind = MasterPrompt::KINDS.key?(params[:kind]) ? params[:kind] : MasterPrompt::KINDS.keys.first
      @prompts = MasterPrompt.library(@kind)
    end

    def new
      kind = MasterPrompt::KINDS.key?(params[:kind]) ? params[:kind] : MasterPrompt::KINDS.keys.first
      @prompt = MasterPrompt.new(kind: kind, body: MasterPrompt.active_for(kind)&.body)
    end

    def create
      @prompt = MasterPrompt.new(prompt_params.merge(kind: params.dig(:master_prompt, :kind)))
      if @prompt.save
        @prompt.activate! if params[:activate]
        redirect_to edit_admin_prompt_path(@prompt), notice: saved_notice
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit; end

    def update
      if @prompt.update(prompt_params)
        @prompt.activate! if params[:activate]
        redirect_to edit_admin_prompt_path(@prompt), notice: saved_notice
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def activate
      @prompt.activate!
      redirect_to admin_prompts_path(kind: @prompt.kind), notice: "#{@prompt.name} is the #{label} prompt now"
    end

    def duplicate
      copy = @prompt.duplicate
      redirect_to edit_admin_prompt_path(copy), notice: "Copied to #{copy.name}"
    end

    def destroy
      if @prompt.destroy
        redirect_to admin_prompts_path(kind: @prompt.kind), notice: "Deleted #{@prompt.name}"
      else
        redirect_to admin_prompts_path(kind: @prompt.kind), alert: "The active prompt stays. Use another one first."
      end
    end

    private

    def set_prompt
      @prompt = MasterPrompt.find(params[:id])
    end

    def prompt_params
      params.expect(master_prompt: %i[name body notes])
    end

    def label = MasterPrompt.label(@prompt.kind)

    def saved_notice
      missing = @prompt.missing_keys
      return "Saved" if missing.empty?

      "Saved. It no longer names #{missing.to_sentence}: if the answers lose them, generation falls back to Original."
    end
  end
end
