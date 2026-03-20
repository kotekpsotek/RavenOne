<script lang=ts>
    import { page } from "$app/stores";
    import { UI } from "@ravenlens/frontend";
    import MaterialView from "../../add/utils/Material.svelte";
    import type { HelpMaterialWithContent } from "@ravenlens/shared";

    /* 'test' id is the test material name -> for different material assure it's downloaded from backend */
    let material: HelpMaterialWithContent | null = null;

    $: material = (($page.data as unknown as { material?: HelpMaterialWithContent })?.material) ?? null;

    // Allows to edit material when permitted user clicked on "Edit" button
    $: isEditionMode = $page.url?.searchParams?.get('edit') === '1';

    const demoMaterial: HelpMaterialWithContent = {
        id: "test",
        title: "Highlights and takeaways from RavenLens Help",
        description: "",
        imgURL: "https://picsum.photos/id/1039/1200/650",
        category: "Help",
        publicationDate: new Date("2025-12-18"),
        content: `
            <p>This is a demo article body. Once the backend load is wired, this view will render the real material content.</p>
            <p>Use the left share rail on desktop, or the share buttons in the header on mobile.</p>
            <p>Images are displayed in a rounded card container as shown in the reference screenshot.</p>
        `.trim()
    };
</script>

<UI.Common.PageWrapper
    flexLayout="column"
>
    <MaterialView
        material={material ?? demoMaterial}
        isEditionMode={isEditionMode}
        backHref="/help-materials"
        backLabel="All posts"
        authorName="RavenLens"
        authorRole=""
    />
</UI.Common.PageWrapper>