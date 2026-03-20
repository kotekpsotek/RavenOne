<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import MaterialView from "./utils/Material.svelte";
</script>

<UI.Common.PageWrapper>
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
    />
</UI.Common.PageWrapper>
