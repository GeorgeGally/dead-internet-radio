# frozen_string_literal: true

module Admin
  # The prompt library: saved system prompts per kind, one active per kind.
  # Each kind opens straight onto its active prompt, editable in place.
  class PromptsController < Admin::BaseController
    before_action { MasterPrompt.ensure_seeded! }
    before_action :set_prompt, only: %i[edit update destroy activate duplicate]

    def index
      kind = MasterPrompt::KINDS.key?(params[:kind]) ? params[:kind] : MasterPrompt::KINDS.keys.first
      @prompt = MasterPrompt.active_for(kind) || MasterPrompt.library(kind).first
      render :edit
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
      return save_as_new if params[:as_new]

      if @prompt.update(prompt_params)
        @prompt.activate! if params[:activate]
        redirect_to edit_admin_prompt_path(@prompt), notice: saved_notice
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def activate
      @prompt.activate!
      redirect_to edit_admin_prompt_path(@prompt), notice: "#{@prompt.name} is the #{label} prompt now"
    end

    def duplicate
      copy = @prompt.duplicate
      redirect_to edit_admin_prompt_path(copy), notice: "Copied to #{copy.name}"
    end

    def destroy
      if @prompt.destroy
        redirect_to admin_prompts_path(kind: @prompt.kind), notice: "Deleted #{@prompt.name}"
      else
        redirect_to edit_admin_prompt_path(@prompt), alert: "The active prompt stays. Use another one first."
      end
    end

    private

    def set_prompt
      @prompt = MasterPrompt.find(params[:id])
    end

    def prompt_params
      params.expect(master_prompt: %i[name body notes])
    end

    # The edited text as a new prompt of the same kind; the one it came from
    # keeps its text.
    def save_as_new
      attrs = prompt_params
      source = @prompt
      name = attrs[:name].presence || source.name
      name = MasterPrompt.free_name(source.kind, name == source.name ? "#{name} copy" : name)
      @prompt = MasterPrompt.new(attrs.merge(kind: source.kind, name: name))
      if @prompt.save
        redirect_to edit_admin_prompt_path(@prompt), notice: saved_notice
      else
        failed = @prompt
        @prompt = source.tap { |p| p.assign_attributes(attrs) }
        @prompt.errors.merge!(failed.errors)
        render :edit, status: :unprocessable_entity
      end
    end

    def label = MasterPrompt.label(@prompt.kind)

    def saved_notice
      missing = @prompt.missing_keys
      return "Saved" if missing.empty?

      "Saved. It no longer names #{missing.to_sentence}: if the answers lose them, generation falls back to Original."
    end
  end
end
