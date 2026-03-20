<script lang="ts">
	import Icon from "@iconify/svelte";
	import type { HelpMaterialWithContent } from "@ravenlens/shared";
    import { UI } from "@ravenlens/frontend";
    import { browser } from "$app/environment";
    import { readable, type Readable } from "svelte/store";
    import { createEditor, EditorContent, type Editor as SvelteEditor } from 'svelte-tiptap';
    import Typography from '@tiptap/extension-typography'
    import StarterKit from '@tiptap/starter-kit';
    import { Placeholder } from '@tiptap/extensions'
    import ReplacerExtension from "./tiptap-extensions/Replacer";
    import { CodeBlockExtension } from "./tiptap-extensions/codeblock/CodeBlock";
    import "./MaterialEditor.css"

    export let isEditionMode: boolean = false;
	export let material: HelpMaterialWithContent | null = null;
    export let backHref = "/help";
	export let backLabel = "All posts";

    const MAX_DESCRIPTION_CHARS = 300;

    // Prevents from reactivity what breaks caret position in title
    let materialTitle = material?.title ?? "";
    let selectedFiles: FileList | undefined;
    let _previewObjectUrl: string | null = null;
    
	// Optional author info (not currently present in HelpMaterial types)
	export let authorName = "RavenLens";
	export let authorRole = "";
	export let authorAvatarUrl = "";

    // State
    let isImageUploadingToBackend: boolean = false;
    let isArticleImageHovering: boolean = false;

    /**
     * TODO: 
     * 1. Add ability to add image
     *  1. Add the image custom component
     *  2. Add the image element to menu above editor
     */
    //
    const editor: Readable<SvelteEditor | undefined> = browser ? createEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false,
                link: {
                    autolink: true
                }
            }),
            CodeBlockExtension,
            Placeholder.configure({
                placeholder: "Write next paragraph"
            }),
            Typography,
            ReplacerExtension
        ],
        content: material?.content ?? "",
        editable: isEditionMode
    }) : readable<SvelteEditor | undefined>(undefined);
    
    // 
	$: published = isEditionMode ? formatDate(new Date()) : formatDate(material?.publicationDate);
	$: locationLabel = material?.category ? material.category : "Help";
    $: minutes = isEditionMode ? estimateReadMinutes($editor?.getText()) : estimateReadMinutes(material?.content);

    function toggleHeading(level: 1 | 2 | 3) {
        if (!$editor) return;
        $editor.chain().focus().toggleHeading({ level }).run();
    }

    function toggleBold() {
        if (!$editor) return;
        $editor.chain().focus().toggleBold().run();
    }

    function toggleItalic() {
        if (!$editor) return;
        $editor.chain().focus().toggleItalic().run();
    }

    function toggleBulletList() {
        if (!$editor) return;
        $editor.chain().focus().toggleBulletList().run();
    }

    function toggleOrderedList() {
        if (!$editor) return;
        $editor.chain().focus().toggleOrderedList().run();
    }

    function toggleBlockquote() {
        if (!$editor) return;
        $editor.chain().focus().toggleBlockquote().run();
    }

    function toggleInlineCode() {
        if (!$editor) return;
        $editor.chain().focus().toggleCode().run();
    }

    function toggleCodeBlock() {
        if (!$editor) return;
        $editor.chain().focus().toggleCodeBlock().run();
    }

    function undo() {
        if (!$editor) return;
        $editor.chain().focus().undo().run();
    }

    function redo() {
        if (!$editor) return;
        $editor.chain().focus().redo().run();
    }
    
    // Helpers
	function formatDate(date: Date | string | undefined | null) {
		if (!date) return "";
		const d = date instanceof Date ? date : new Date(date);
		if (Number.isNaN(d.getTime())) return "";
		return new Intl.DateTimeFormat("en-US", {
			month: "long",
			day: "numeric",
			year: "numeric"
		}).format(d);
	}

	function estimateReadMinutes(htmlOrText: string | undefined | null) {
		const s = (htmlOrText ?? "").trim();
		if (!s) return 0;
		const plain = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
		const words = plain ? plain.split(" ").length : 0;
		const minutes = Math.max(1, Math.round(words / 200));
		return minutes;
	}

    function onEditArticleTitle(ev: Event) {
        const target = ev.currentTarget as HTMLHeadingElement;
        const textContent = target.textContent;

        if (!textContent.length) {
            target.innerHTML = "";
        }

        // Text content
        material!.title = textContent;
    }

    function onArticleImageMouseOnAction() {
        isArticleImageHovering = !isArticleImageHovering;
    }

    async function onEditArticleImage() {
        if (!isEditionMode) return;

        const imageInput = document.getElementById("article-image") as HTMLInputElement;
        imageInput.click();
    }

    async function onAddPost(ev: Event) {

    }
    
    async function handleArticleImageChange(ev: Event) {
        const input = ev.currentTarget as HTMLInputElement;
        const file = input.files && input.files[0];
        if (!file) return;

        isArticleImageHovering = false;

        const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            alert("Please select a valid image file (.png, .jpg, .jpeg, .gif, .webp)");
            input.value = "";
            return;
        }

        // Show immediate preview using an object URL
        if (_previewObjectUrl) {
            URL.revokeObjectURL(_previewObjectUrl);
            _previewObjectUrl = null;
        }
        _previewObjectUrl = URL.createObjectURL(file);
        material!.imgURL = _previewObjectUrl;

        // Start upload
        isImageUploadingToBackend = true;

        try {
            const uploadedUrl = await uploadImageToServerSimulation(file);
            // Replace preview with backend URL
            if (_previewObjectUrl) {
                URL.revokeObjectURL(_previewObjectUrl);
                _previewObjectUrl = null;
            }
            material!.imgURL = uploadedUrl;
            isImageUploadingToBackend = false;
        } catch (err) {
            // Upload failed: clear preview + notify
            if (_previewObjectUrl) {
                URL.revokeObjectURL(_previewObjectUrl);
                _previewObjectUrl = null;
            }
            delete material!.imgURL;
            isImageUploadingToBackend = false;
            input.value = "";
            alert("Image upload failed. Please try again.");
        }
    }

    function handleDescriptionInput(ev: Event) {
        const ta = ev.currentTarget as HTMLTextAreaElement;
        if (!ta) return;
        if (ta.value.length > MAX_DESCRIPTION_CHARS) {
            ta.value = ta.value.slice(0, MAX_DESCRIPTION_CHARS);
        }
        if (!material) return;
        material.description = ta.value;
    }

    // Simulated upload function: replace with real API call.
    function uploadImageToServerSimulation(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            // Simulate latency
            setTimeout(() => {
                // Simulate success most of the time
                const fail = Math.random() < 0.12; // ~12% failure
                if (fail) {
                    reject(new Error("simulated upload failure"));
                } else if (_previewObjectUrl) {
                    // Return a placeholder remote URL (replace with real response)
                    const id = Math.floor(Math.random() * 1000) + 100;

                    // FIXME: Return a real response image url
                    resolve(_previewObjectUrl);
                }
                else throw("Cannot upload file")
            }, 2000);
        });
    }
</script>

{#snippet ArticleImage()} 
    {#if isEditionMode || material?.imgURL}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <svelte:element 
            this={isEditionMode ? "button" : "div"} 
            class="card w-full bg-base-100 rounded-2xl overflow-hidden mb-8 transition-all duaration-100 {isEditionMode ? `border border-base-content/20 border-3 ${!material?.imgURL ? "h-[300px]" : ""} border-dashed cursor-pointer hover:scale-[1.01] hover:shadow-xl hover:shadow-base-content/10 hover:border-os2-100` : "border border-base-200 relative"}"

            on:click={onEditArticleImage}
            on:mouseenter={onArticleImageMouseOnAction}
            on:mouseleave={onArticleImageMouseOnAction}
        >
            {#if isEditionMode}
                <input 
                    type="file" 
                    id="article-image"
                    accept=".png,.jpg,.jpeg,.gif,.webp"
                    hidden
                    bind:files={selectedFiles}
                    on:change={handleArticleImageChange}
                />
            {/if}
            
            <!-- svelte-ignore a11y_img_redundant_alt -->
            {#if material?.imgURL}
                <img
                    src={material.imgURL}
                    alt="Article image"
                    class="w-full h-auto object-cover"
                    loading="lazy"
                />
                
                {#if isEditionMode && isArticleImageHovering}
                    <div
                        class="absolute top-0 right-0 w-full h-full flex items-center gap-2 justify-center bg-black/50 text-white"
                    >
                        <Icon icon="material-symbols:image-outline-rounded"/>
                        <span>Change Image</span>
                    </div>
                {/if}
            {:else}
                {#if isImageUploadingToBackend}
                    <div class="uploading-image flex gap-2 items-center justify-center w-full h-full">
                        <span class="loading loading-spinner loading-xl"></span>
                        <span>Uploading image</span>
                    </div>
                {:else}
                    <div class="add-image-notion w-full h-full flex justify-center items-center gap-2 transition-all duaration-100 hover:text-os2-100">
                        <Icon icon="material-symbols:image-outline-rounded"/>
                        <span>Add Image</span>
                    </div>
                {/if}
            {/if}
        </svelte:element>
    {/if}
{/snippet}

<div class="w-full">
	<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
		<div class="mb-6 flex justify-between items-center">
            <UI.Common.GoBackButton
                elementType="a"
                {backHref}
                {backLabel}
            />
            
            {#if isEditionMode}
                {@const isDisabled = ($editor?.getText().trim().length ?? 0) === 0 && material?.title.trim().length === 0 && material?.description.trim().length === 0 && !material?.imgURL}
            
                <button 
                    class="btn btn-sm btn-primary"
                    disabled={isDisabled}
                    title={isDisabled ? "To publish document type some description" : ""}

                    on:click={onAddPost}
                >
                    Add Post
                </button>
            {/if}
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-[10rem_minmax(0,1fr)] gap-8">
			<!-- Share rail (desktop) -->
			<aside class="hidden lg:block">
				<div class="sticky top-24">
					<div class="text-xs text-base-content/70 mb-4">{minutes} min read</div>

                    {#if !isEditionMode}
                        <div class="text-xs tracking-wide text-base-content/60 mb-2 uppercase">SHARE THIS POST</div>
                        <div class="flex gap-2">
                            <a
                                class="btn btn-ghost btn-circle btn-sm"
                                href={material ? `https://x.com/intent/tweet?text=${encodeURIComponent(material.title)}&url=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Share on X"
                            >
                                <Icon icon="simple-icons:x" width="16" height="16" />
                            </a>
                            <a
                                class="btn btn-ghost btn-circle btn-sm"
                                href={material ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Share on LinkedIn"
                            >
                                <Icon icon="mdi:linkedin" width="18" height="18" />
                            </a>
                            <a
                                class="btn btn-ghost btn-circle btn-sm"
                                href={material ? `mailto:?subject=${encodeURIComponent(material.title)}&body=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                aria-label="Share via email"
                            >
                                <Icon icon="material-symbols:mail-outline" width="18" height="18" />
                            </a>
                        </div>
                    {/if}
				</div>
			</aside>

			<!-- Main content -->
			<article class="min-w-0">
				<div class="max-w-3xl">
					<div class="text-sm text-base-content/60 mb-3">
                        {#if isEditionMode}
                            Will be published on {published} in <span class="text-base-content/80">{locationLabel}</span>
                        {:else}
                            {#if published}
                                Published {published} in <span class="text-base-content/80">{locationLabel}</span>
                            {/if}
                        {/if}
					</div>

					<h1 
                        class="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-base-content mb-5 outline-none"
                        data-placeholder="Type Article Title..."
                        contenteditable={isEditionMode}
                        on:input={onEditArticleTitle}
                    >
						{materialTitle}
					</h1>

					<div class="flex items-center gap-3 mb-6">
						<div class="avatar">
							<div class="w-10 rounded-full ring ring-base-200 ring-offset-2 ring-offset-base-100">
								{#if authorAvatarUrl}
									<img src={authorAvatarUrl} alt={authorName} />
								{:else}
									<div class="w-full h-full bg-base-200 flex items-center justify-center text-base-content/70">
										<Icon icon="material-symbols:person" width="18" height="18" />
									</div>
								{/if}
							</div>
						</div>
						<div class="leading-tight">
							<div class="text-sm text-base-content">
								<span class="text-base-content/70">By</span>
								<span class="font-medium"> {authorName}</span>
							</div>
							{#if authorRole}
								<div class="text-xs text-base-content/60">{authorRole}</div>
							{/if}
						</div>

						<!-- Share row (mobile) -->
                        {#if !isEditionMode}
                            <div class="ml-auto lg:hidden flex items-center gap-1">
                                <a
                                    class="btn btn-ghost btn-circle btn-sm"
                                    href={material ? `https://x.com/intent/tweet?text=${encodeURIComponent(material.title)}&url=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Share on X"
                                >
                                    <Icon icon="simple-icons:x" width="16" height="16" />
                                </a>
                                <a
                                    class="btn btn-ghost btn-circle btn-sm"
                                    href={material ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Share on LinkedIn"
                                >
                                    <Icon icon="mdi:linkedin" width="18" height="18" />
                                </a>
                                <a
                                    class="btn btn-ghost btn-circle btn-sm"
                                    href={material ? `mailto:?subject=${encodeURIComponent(material.title)}&body=${encodeURIComponent(globalThis?.location?.href ?? "")}` : "#"}
                                    aria-label="Share via email"
                                >
                                    <Icon icon="material-symbols:mail-outline" width="18" height="18" />
                                </a>
                            </div>
                        {/if}
					</div>

					<div class="lg:hidden text-xs text-base-content/70 mb-6">{minutes} min read</div>

                    {#if isEditionMode}
                        <div 
                            class="material-description mb-6"
                        >
                                <fieldset class="fieldset">
                                    <legend class="fieldset-legend">Article Description</legend>
                                    <div class="relative">
                                        {#if material}
                                            <textarea
                                                class="textarea h-24 w-full outline-none"
                                                placeholder="What is this article about?"
                                                bind:value={material.description}
                                                maxlength="300"
                                                on:input={handleDescriptionInput}
                                            ></textarea>
                                        {:else}
                                            <div>Material isn't specified</div>
                                        {/if}

                                        <div class="text-xs text-base-content/60 absolute right-2 bottom-2">
                                            {material?.description ? material.description.length : 0}/{MAX_DESCRIPTION_CHARS}
                                        </div>
                                    </div>
                                </fieldset>
                        </div>
                    {/if}
                    
                    {#if isEditionMode}
                        {@render ArticleImage()}
                    {:else}
                        {#if material?.imgURL}
                            {@render ArticleImage()}
                        {/if}
                    {/if}

                    
                    <div class="editor">
                        {#if isEditionMode}
                            <span style="font-size: 0.75rem; font-weight: 600;">Editor (Article Content)</span>
                        {/if}
                        
                        <div
                            id="article-wrapper"
                            class="min-h-[12rem] {isEditionMode ? "border card bg-base-100 theme-dark:border-base-content/20 rounded-lg overflow-hidden" : ""}"
                        >
                            {#if isEditionMode && $editor}
                                <div class="flex flex-wrap items-center gap-1 bg-base-200 border border-base-200 p-1">
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={() => toggleHeading(1)} title="Heading 1">H1</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={() => toggleHeading(2)} title="Heading 2">H2</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={() => toggleHeading(3)} title="Heading 3">H3</button>
        
        
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleBold} title="Bold"><strong>B</strong></button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleItalic} title="Italic"><em>I</em></button>
        
        
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleBulletList} title="Bullet List">• List</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleOrderedList} title="Ordered List">1. List</button>
        
        
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleBlockquote} title="Quote">❝</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleInlineCode} title="Inline Code">&lt;/&gt;</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={toggleCodeBlock} title="Code Block">{'{ }'}</button>
        
        
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={undo} title="Undo">↶</button>
                                    <button class="btn btn-xs btn-ghost" type="button" on:click|preventDefault={redo} title="Redo">↷</button>
                                </div>
                            {/if}
    
                            <div 
                                class="article-content"
                                data-editable={isEditionMode}
                            >
                                <EditorContent 
                                    editor={$editor}
                                    class="material-editor"
                                />
                            </div>
                        </div>
                    </div>
				</div>
			</article>
		</div>
	</div>
</div>

<style>
    *[contenteditable=true]:empty:before {
        content: attr(data-placeholder);
        color: var(--color-base-content);
        opacity: 0.7;
    }
</style>
