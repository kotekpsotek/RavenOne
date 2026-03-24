    <script lang="ts">
    import Icon from "@iconify/svelte";
    import { BubbleMenu } from "svelte-tiptap";
    import { editor } from "$lib/stores/editor";

    type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

    let {
        headingSizes = [1, 2, 3] as HeadingLevel[]
    } = $props<{ headingSizes?: HeadingLevel[] }>();

    function hasSelectedText(): boolean {
        if (!$editor) {
            return false;
        }

        const { from, to } = $editor.state.selection;
        return from !== to;
    }

    function toolbarButtonClass(isActive: boolean): string {
        return isActive ? "btn btn-xs btn-primary" : "btn btn-xs btn-ghost";
    }

    function toggleHeading(level: HeadingLevel): void {
        if (!$editor || !hasSelectedText()) {
            return;
        }

        $editor.chain().focus().toggleHeading({ level }).run();
    }

    function toggleBold(): void {
        if (!$editor || !hasSelectedText()) {
            return;
        }

        $editor.chain().focus().toggleBold().run();
    }

    function toggleItalic(): void {
        if (!$editor || !hasSelectedText()) {
            return;
        }

        $editor.chain().focus().toggleItalic().run();
    }

    function toggleStrike(): void {
        if (!$editor || !hasSelectedText()) {
            return;
        }

        $editor.chain().focus().toggleStrike().run();
    }

    function toggleCode(): void {
        if (!$editor || !hasSelectedText()) {
            return;
        }

        $editor.chain().focus().toggleCode().run();
    }

    function toggleBlockquote(): void {
        if (!$editor) {
            return;
        }

        $editor.chain().focus().toggleBlockquote().run();
    }

    function toggleBulletList(): void {
        if (!$editor) {
            return;
        }

        $editor.chain().focus().toggleBulletList().run();
    }

    function toggleOrderedList(): void {
        if (!$editor) {
            return;
        }

        $editor.chain().focus().toggleOrderedList().run();
    }

    function undo(): void {
        if (!$editor) {
            return;
        }

        $editor.chain().focus().undo().run();
    }

    function redo(): void {
        if (!$editor) {
            return;
        }

        $editor.chain().focus().redo().run();
    }
</script>

{#if $editor}
    <BubbleMenu editor={$editor} options={{ placement: "top" }}>
        <div class="rounded-box border border-base-300 bg-base-100/95 px-2 py-2 shadow-xl backdrop-blur-sm">
            <div class="flex items-center gap-2">
                <div class="dropdown dropdown-top">
                    <button type="button" class={toolbarButtonClass($editor.isActive("heading"))}>
                        <Icon icon="lucide:heading" width="16" height="16" />
                    </button>
                    <ul class="dropdown-content menu z-[999] mt-2 w-32 rounded-box border border-base-300 bg-base-100 p-2 shadow">
                        {#each headingSizes as headingSize (headingSize)}
                            <li>
                                <button
                                    type="button"
                                    class={toolbarButtonClass($editor.isActive("heading", { level: headingSize }))}
                                    onclick={() => toggleHeading(headingSize)}
                                >
                                    H{headingSize}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>

                <div class="join">
                    <button type="button" class={toolbarButtonClass($editor.isActive("bold"))} onclick={toggleBold}>
                        <Icon icon="lucide:bold" width="16" height="16" />
                    </button>
                    <button type="button" class={toolbarButtonClass($editor.isActive("italic"))} onclick={toggleItalic}>
                        <Icon icon="lucide:italic" width="16" height="16" />
                    </button>
                    <button type="button" class={toolbarButtonClass($editor.isActive("strike"))} onclick={toggleStrike}>
                        <Icon icon="lucide:strikethrough" width="16" height="16" />
                    </button>
                    <button type="button" class={toolbarButtonClass($editor.isActive("code"))} onclick={toggleCode}>
                        <Icon icon="lucide:code" width="16" height="16" />
                    </button>
                </div>

                <div class="join">
                    <button type="button" class={toolbarButtonClass($editor.isActive("bulletList"))} onclick={toggleBulletList}>
                        <Icon icon="lucide:list" width="16" height="16" />
                    </button>
                    <button type="button" class={toolbarButtonClass($editor.isActive("orderedList"))} onclick={toggleOrderedList}>
                        <Icon icon="lucide:list-ordered" width="16" height="16" />
                    </button>
                    <button type="button" class={toolbarButtonClass($editor.isActive("blockquote"))} onclick={toggleBlockquote}>
                        <Icon icon="lucide:text-quote" width="16" height="16" />
                    </button>
                </div>

                <div class="join">
                    <button type="button" class="btn btn-xs btn-ghost" onclick={undo}>
                        <Icon icon="lucide:undo-2" width="16" height="16" />
                    </button>
                    <button type="button" class="btn btn-xs btn-ghost" onclick={redo}>
                        <Icon icon="lucide:redo-2" width="16" height="16" />
                    </button>
                </div>
            </div>
        </div>
    </BubbleMenu>
{/if}
