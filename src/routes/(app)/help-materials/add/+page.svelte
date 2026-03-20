<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import MaterialView from "./utils/Material.svelte";
    import { page } from "$app/stores";
</script>

<UI.Common.PageWrapper additionalClass="overflow-y-auto">
    <MaterialView
        isEditionMode={true}
        material={{
            content: "",
            description: "",
            title: "",
            id: "",
            imgURL: "",
            publicationDate: new Date()
        }}
        backHref="/help-materials"
        backLabel="All posts"
        authorName="RavenOne"
        authorRole=""
        editModeCategoriesAvailable={$page.data.editModeCategoriesAvailable}
    />
</UI.Common.PageWrapper>
