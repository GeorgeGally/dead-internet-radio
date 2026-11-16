# frozen_string_literal: true

require "test_helper"

class AdminPromptsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
  end

  teardown { ActiveJob::Base.queue_adapter = @old_queue_adapter }

  test "only an admin sees the library" do
    get admin_prompts_path
    assert_redirected_to admin_login_path
  end

  test "each kind opens on its active prompt, editable in place" do
    sign_in
    get admin_prompts_path(kind: "dj")
    assert_response :success
    assert_select ".prompt-kinds a", MasterPrompt::KINDS.size
    assert_select "select.prompt-select option[selected]", "Original · in use"
    assert_select "form#prompt-form textarea.prompt-body", text: /\S/
  end

  test "save as new keeps the original and opens the copy" do
    sign_in
    MasterPrompt.ensure_seeded!
    original = MasterPrompt.active_for("rewrite")
    patch admin_prompt_path(original), params: { as_new: "1", master_prompt: { name: "Original", body: "#{original.body}\nLouder.", notes: "" } }
    copy = MasterPrompt.find_by!(kind: "rewrite", name: "Original copy")
    assert_redirected_to edit_admin_prompt_path(copy)
    assert_match(/Louder\.\z/, copy.body)
    assert_no_match(/Louder/, original.reload.body)
    assert_equal 1, original.version
    assert_predicate original, :active?
  end

  test "save a new prompt and use it, then switch back" do
    sign_in
    post admin_prompts_path, params: { activate: "1", master_prompt: { kind: "music", name: "Darker", body: "caption lyrics", notes: "test" } }
    darker = MasterPrompt.find_by!(kind: "music", name: "Darker")
    assert_redirected_to edit_admin_prompt_path(darker)
    assert_predicate darker, :active?
    assert_match(/no longer names/, flash[:notice])

    original = MasterPrompt.find_by!(kind: "music", name: "Original")
    post activate_admin_prompt_path(original)
    assert_predicate original.reload, :active?
    assert_not darker.reload.active?
  end

  test "edit, duplicate and delete" do
    sign_in
    MasterPrompt.ensure_seeded!
    original = MasterPrompt.active_for("brief")
    get edit_admin_prompt_path(original)
    assert_response :success
    assert_select "textarea.prompt-body", text: /show_name/

    post duplicate_admin_prompt_path(original)
    copy = MasterPrompt.find_by!(kind: "brief", name: "Original copy")
    patch admin_prompt_path(copy), params: { master_prompt: { name: "Wider", body: "#{copy.body}\nWider.", notes: "" } }
    assert_equal 2, copy.reload.version

    delete admin_prompt_path(original)
    assert MasterPrompt.exists?(original.id)
    delete admin_prompt_path(copy)
    assert_not MasterPrompt.exists?(copy.id)
  end

  test "an empty prompt is refused" do
    sign_in
    MasterPrompt.ensure_seeded!
    prompt = MasterPrompt.active_for("dj")
    patch admin_prompt_path(prompt), params: { master_prompt: { name: "Original", body: " " } }
    assert_response :unprocessable_entity
    assert_predicate prompt.reload.body, :present?
  end

  test "the Generate form picks a prompt per run" do
    sign_in
    MasterPrompt.ensure_seeded!
    darker = MasterPrompt.create!(kind: "music", name: "Darker", body: "caption lyrics")
    get new_admin_generation_path
    assert_select "select[name='prompts[music]'] option", 2

    post admin_generation_index_path, params: { slot: "late night", track_count: 2, dry_run: "1",
                                                prompts: { music: darker.id, dj: MasterPrompt.active_for("dj").id } }
    assert_equal({ "music" => darker.id.to_s }, GenerationJob.last.prompt_choices)
  end

  private

  def sign_in
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
    assert_redirected_to admin_path
  end
end
