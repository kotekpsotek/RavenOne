<script lang=ts>
    import { UI } from "@ravenlens/frontend";
    import ProfileLoader from "$lib/screens/ProfileLoader.svelte";
    import { theme } from "$lib/stores/theme";
    import type { Profile } from "@ravenlens/shared";
    import type { LoadBackendWorkspace } from "./type";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import type { ComponentProps } from "svelte";
    import { alertState } from "$lib/utils/alert";
    import { defaultAvaiableOptions } from ".";

    export let data: LoadBackendWorkspace;

    const onSetAlertState: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSetAlertState"] = state => {
        $alertState = state;
    }
</script>

<UI.Common.PageWrapper>
    <ProfileLoader>
        {#snippet children(profile: Profile)}
            <UI.Workspace.Settings.WorkspaceSettingsScreen
                open={true}
                user={profile}
                theme={$theme}
                avaiableOptions={[...$defaultAvaiableOptions]}
                selectedWorkspace={data.workspaceLoaded}
                {fetchAuthenticated}
                {onSetAlertState}
            >
                <slot/>
            </UI.Workspace.Settings.WorkspaceSettingsScreen>
        {/snippet}
    </ProfileLoader>
</UI.Common.PageWrapper>
