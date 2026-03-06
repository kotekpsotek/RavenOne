<script lang="ts">
    import ProfileLoader from "$lib/screens/ProfileLoader.svelte";
    import { theme } from "$lib/stores/theme";
    import { UI } from "@ravenlens/frontend";
    import type { Profile, ProfilePageLoadData } from "@ravenlens/shared";
    import { PageWrapper } from "../../../../../../packages/frontend/dist/ui/common";

    export let data: ProfilePageLoadData;

    /** Reidrects to webpage where are subscription */
    function onBuySubscription() {
        
    };

    /** Reidrects to subscription canceltation page */
    function onCancelSubscription() {

    };

    /** Deleting account */
    function onDeleteAccount() {
        
    };
</script>

<PageWrapper
    additionalClass="h-full overflow-y-auto p-10"
>
    <ProfileLoader>
        {#snippet children(profile: Profile)}
            {#if profile}
                <UI.Pages.ProfilePage
                    theme={$theme}
                    pageData={data}
                    user={profile}
                    {onBuySubscription}
                    {onCancelSubscription}
                    {onDeleteAccount}
                />
            {/if}
        {/snippet}
    </ProfileLoader>
</PageWrapper>
