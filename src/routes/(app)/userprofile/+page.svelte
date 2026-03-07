<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import ProfileLoader from "$lib/screens/ProfileLoader.svelte";
    import { theme } from "$lib/stores/theme";
    import { userProfile } from "$lib/stores/user";
    import { isUserAuthenticated, JWTAuth } from "$lib/utils/auth";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { UI } from "@ravenlens/frontend";
    import type { Profile, ProfilePageLoadData } from "@ravenlens/shared";
    import { PageWrapper } from "../../../../../../packages/frontend/dist/ui/common";
    import { onDestroy, tick } from "svelte";

    const DELETE_CODE_LENGTH = 6;

    let { data }: { data: ProfilePageLoadData } = $props();

    type ProfileSaveBadge = {
        kind: "saving" | "success" | "error";
        message: string;
    };

    type DeleteFlowStage = "idle" | "sending-code" | "awaiting-code" | "verifying-code";

    let profileSaveBadge = $state<ProfileSaveBadge | undefined>(undefined);
    let hideProfileSaveBadgeTimeout = $state<ReturnType<typeof setTimeout> | undefined>(undefined);

    let showDeleteVerification = $state(false);
    let deleteFlowStage = $state<DeleteFlowStage>("idle");
    let deleteVerificationEmail = $state("");
    let deleteVerificationError = $state<string | undefined>(undefined);
    let deleteCodeDigits = $state<string[]>(Array.from({ length: DELETE_CODE_LENGTH }, () => ""));

    function clearHideBadgeTimeout() {
        if (hideProfileSaveBadgeTimeout) {
            clearTimeout(hideProfileSaveBadgeTimeout);
            hideProfileSaveBadgeTimeout = undefined;
        }
    }

    function scheduleBadgeHide(timeoutMs = 3000) {
        clearHideBadgeTimeout();
        hideProfileSaveBadgeTimeout = setTimeout(() => {
            profileSaveBadge = undefined;
            hideProfileSaveBadgeTimeout = undefined;
        }, timeoutMs);
    }

    function dismissBadge() {
        clearHideBadgeTimeout();
        profileSaveBadge = undefined;
    }

    async function toErrorMessageFromResponse(response: Response): Promise<string> {
        try {
            const responseBody = (await response.json()) as { error?: string; message?: string };
            if (responseBody.error) return responseBody.error;
            if (responseBody.message) return responseBody.message;
        } catch {
            // Ignore JSON parsing issue and try plain text below.
        }

        try {
            const textBody = await response.text();
            if (textBody.trim()) return textBody;
        } catch {
            // Ignore text parsing issue and use fallback message.
        }

        return `Request failed with status ${response.status}`;
    }

    function toErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === "string") return err;

        try {
            return JSON.stringify(err);
        } catch {
            return String(err);
        }
    }

    function resetDeleteCodeDigits() {
        deleteCodeDigits = Array.from({ length: DELETE_CODE_LENGTH }, () => "");
    }

    function isDeleteActionInProgress(): boolean {
        return deleteFlowStage === "sending-code" || deleteFlowStage === "verifying-code";
    }

    function isDeleteCodeComplete(): boolean {
        return deleteCodeDigits.every((digit) => /^\d$/.test(digit));
    }

    function getDeleteCode(): string {
        return deleteCodeDigits.join("");
    }

    function getDeleteCodeInput(index: number): HTMLInputElement | null {
        if (typeof document === "undefined") {
            return null;
        }

        return document.querySelector<HTMLInputElement>(`[data-delete-code-input="${index}"]`);
    }

    function focusDeleteCodeInput(index: number, shouldSelect = true) {
        const input = getDeleteCodeInput(index);
        if (!input) {
            return;
        }

        input.focus();
        if (shouldSelect) {
            input.select();
        }
    }

    function closeDeleteVerificationModal() {
        if (isDeleteActionInProgress()) return;

        showDeleteVerification = false;
        deleteFlowStage = "idle";
        deleteVerificationError = undefined;
        deleteVerificationEmail = "";
        resetDeleteCodeDigits();
    }

    async function ensureAuthenticatedToken(): Promise<string | undefined> {
        const token = JWTAuth.getToken();
        if (!token) {
            await goto("/auth/login");
            return;
        }

        const authenticated = await isUserAuthenticated(token);
        if (!authenticated) {
            JWTAuth.deleteToken();
            await goto("/auth/login");
            return;
        }

        return token;
    }

    async function sendDeleteCode() {
        deleteVerificationError = undefined;
        deleteFlowStage = "sending-code";

        const token = await ensureAuthenticatedToken();
        if (!token) {
            deleteFlowStage = "idle";
            return;
        }

        try {
            const sendCodeResponse = await fetchAuthenticated(
                $page.url.pathname,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "send-delete-code"
                    })
                },
                token
            );

            if (sendCodeResponse.status === 401) {
                JWTAuth.deleteToken();
                await goto("/auth/login");
                return;
            }

            if (!sendCodeResponse.ok) {
                throw new Error(await toErrorMessageFromResponse(sendCodeResponse));
            }

            const responseBody = (await sendCodeResponse.json()) as {
                email?: string;
                message?: string;
            };

            deleteVerificationEmail = responseBody.email ?? "your email";
            deleteFlowStage = "awaiting-code";
            resetDeleteCodeDigits();

            await tick();
            focusDeleteCodeInput(0, false);
        } catch (err) {
            deleteFlowStage = "awaiting-code";
            deleteVerificationError = toErrorMessage(err);
        }
    }

    async function confirmDeleteAccount() {
        const code = getDeleteCode();
        if (!/^\d{6}$/.test(code)) {
            deleteVerificationError = "Enter the 6-digit code sent to your email";
            return;
        }

        deleteVerificationError = undefined;
        deleteFlowStage = "verifying-code";

        const token = await ensureAuthenticatedToken();
        if (!token) {
            deleteFlowStage = "idle";
            return;
        }

        try {
            const deleteResponse = await fetchAuthenticated(
                $page.url.pathname,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ code })
                },
                token
            );

            if (deleteResponse.status === 401) {
                JWTAuth.deleteToken();
                await goto("/auth/login");
                return;
            }

            if (!deleteResponse.ok) {
                throw new Error(await toErrorMessageFromResponse(deleteResponse));
            }

            JWTAuth.deleteToken();
            userProfile.set(undefined);
            closeDeleteVerificationModal();
            await goto("/auth/login");
        } catch (err) {
            deleteFlowStage = "awaiting-code";
            deleteVerificationError = toErrorMessage(err);
        }
    }

    function onDeleteCodeInput(index: number, event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const normalizedValue = input.value.replace(/\D/g, "").slice(-1);

        deleteCodeDigits[index] = normalizedValue;
        input.value = normalizedValue;

        if (normalizedValue && index < DELETE_CODE_LENGTH - 1) {
            focusDeleteCodeInput(index + 1);
        }
    }

    function onDeleteCodeKeydown(index: number, event: KeyboardEvent) {
        if (event.key === "Backspace" && !deleteCodeDigits[index] && index > 0) {
            const previousIndex = index - 1;
            deleteCodeDigits[previousIndex] = "";
            focusDeleteCodeInput(previousIndex);
            return;
        }

        if (event.key === "ArrowLeft" && index > 0) {
            focusDeleteCodeInput(index - 1, false);
            return;
        }

        if (event.key === "ArrowRight" && index < DELETE_CODE_LENGTH - 1) {
            focusDeleteCodeInput(index + 1, false);
        }
    }

    function onDeleteCodePaste(event: ClipboardEvent) {
        event.preventDefault();

        const pastedText = event.clipboardData?.getData("text") ?? "";
        const digits = pastedText.replace(/\D/g, "").slice(0, DELETE_CODE_LENGTH).split("");

        if (digits.length === 0) {
            return;
        }

        resetDeleteCodeDigits();
        for (let index = 0; index < digits.length; index += 1) {
            deleteCodeDigits[index] = digits[index];
        }

        const nextFocusIndex = Math.min(digits.length, DELETE_CODE_LENGTH - 1);
        setTimeout(() => {
            focusDeleteCodeInput(nextFocusIndex);
        }, 0);
    }

    onDestroy(() => {
        clearHideBadgeTimeout();
    });

    /** Reidrects to webpage where are subscription */
    async function onBuySubscription() {
        await goto("/subscription")
    }

    /** Cancels current subscription at the end of the billing period */
    async function onCancelSubscription() {
        profileSaveBadge = {
            kind: "saving",
            message: "Canceling subscription..."
        };
        clearHideBadgeTimeout();

        const token = await ensureAuthenticatedToken();
        if (!token) {
            profileSaveBadge = undefined;
            return;
        }

        try {
            const cancelResponse = await fetchAuthenticated(
                "/subscription",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "cancel"
                    })
                },
                token
            );

            if (cancelResponse.status === 401) {
                JWTAuth.deleteToken();
                await goto("/auth/login");
                return;
            }

            if (!cancelResponse.ok) {
                throw new Error(await toErrorMessageFromResponse(cancelResponse));
            }

            profileSaveBadge = {
                kind: "success",
                message: "Subscription will be canceled at the end of the current billing period."
            };
            scheduleBadgeHide(6000);

            await goto("/subscription?cancellation=scheduled");
        } catch (err) {
            profileSaveBadge = {
                kind: "error",
                message: `Could not cancel subscription: ${toErrorMessage(err)}`
            };
            scheduleBadgeHide(7000);
        }
    }

    /** Starts two-step account deletion */
    async function onDeleteAccount() {
        showDeleteVerification = true;
        deleteVerificationError = undefined;
        await sendDeleteCode();
    }

    /** Logout */
    async function onLogout() {
        JWTAuth.deleteToken();
        await goto("/auth/login")
    }
</script>

{#if profileSaveBadge}
    <div class="fixed top-4 right-4 z-40 max-w-xl">
        {#if profileSaveBadge.kind === "saving"}
            <div
                class="flex items-center gap-3 rounded-box border border-base-300 bg-base-200/80 px-4 py-2 backdrop-blur-md"
                aria-live="polite"
            >
                <span class="loading loading-spinner loading-sm" aria-label="Saving"></span>
                <span class="text-sm font-medium opacity-80">{profileSaveBadge.message}</span>
            </div>
        {:else}
            <div class={`alert shadow-lg ${profileSaveBadge.kind === "success" ? "alert-success" : "alert-error"}`}>
                <div class="text-sm font-medium break-words">{profileSaveBadge.message}</div>
                <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    aria-label="Dismiss save status"
                    onclick={dismissBadge}
                >
                    ✕
                </button>
            </div>
        {/if}
    </div>
{/if}

{#if showDeleteVerification}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <div class="w-full max-w-lg rounded-2xl border border-base-300 bg-base-100 p-6 shadow-2xl">
            <h3 class="text-lg font-semibold">Account Deletion Verification</h3>
            <p class="mt-2 text-sm opacity-80">
                6-digit code was sent to your email:
                <span class="font-semibold break-all">"{deleteVerificationEmail || "your email"}"</span>
            </p>

            <div class="mt-4" onpaste={onDeleteCodePaste}>
                <div class="flex flex-wrap items-center justify-center gap-2">
                    {#each deleteCodeDigits as digit, index (index)}
                        <input
                            data-delete-code-input={index}
                            type="text"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            pattern="[0-9]*"
                            maxlength="1"
                            class="input input-bordered w-12 text-center text-lg font-semibold"
                            value={digit}
                            oninput={(event) => onDeleteCodeInput(index, event)}
                            onkeydown={(event) => onDeleteCodeKeydown(index, event)}
                            disabled={isDeleteActionInProgress()}
                            aria-label={`Verification code digit ${index + 1}`}
                        />
                    {/each}
                </div>
            </div>

            {#if deleteVerificationError}
                <p class="mt-3 text-sm text-error">{deleteVerificationError}</p>
            {/if}

            <div class="mt-5 flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    class="btn btn-ghost"
                    onclick={closeDeleteVerificationModal}
                    disabled={isDeleteActionInProgress()}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick={sendDeleteCode}
                    disabled={isDeleteActionInProgress()}
                >
                    {deleteFlowStage === "sending-code" ? "Sending..." : "Resend Code"}
                </button>
                <button
                    type="button"
                    class="btn btn-error"
                    onclick={confirmDeleteAccount}
                    disabled={isDeleteActionInProgress() || !isDeleteCodeComplete()}
                >
                    {deleteFlowStage === "verifying-code" ? "Deleting..." : "Delete Account"}
                </button>
            </div>
        </div>
    </div>
{/if}

<PageWrapper
    additionalClass="h-full overflow-y-auto p-10"
>
    <UI.Pages.ProfilePage
        theme={$theme}
        pageData={data}
        user={$userProfile!}
        {onBuySubscription}
        {onCancelSubscription}
        {onDeleteAccount}
        {onLogout}
        onChangePassword={async (newPasswordForm) => {
            profileSaveBadge = {
                kind: "saving",
                message: "Changing password..."
            };
            clearHideBadgeTimeout();

            const token = await ensureAuthenticatedToken();
            if (!token) {
                profileSaveBadge = undefined;
                return false;
            }

            try {
                const changePasswordResponse = await fetchAuthenticated(
                    `${$page.url.pathname.replace(/\/$/, "")}/password-change`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(newPasswordForm)
                    },
                    token
                );

                if (changePasswordResponse.status === 401) {
                    JWTAuth.deleteToken();
                    await goto("/auth/login");
                    return false;
                }

                if (!changePasswordResponse.ok) {
                    throw new Error(await toErrorMessageFromResponse(changePasswordResponse));
                }

                const responseBody = (await changePasswordResponse.json()) as {
                    status?: boolean;
                    message?: string;
                    error?: string;
                };

                if (!responseBody.status) {
                    throw new Error(responseBody.error ?? "Failed to change password");
                }

                profileSaveBadge = {
                    kind: "success",
                    message: responseBody.message ?? "Password changed successfully."
                };
                scheduleBadgeHide(5000);

                return true;
            } catch (err) {
                profileSaveBadge = {
                    kind: "error",
                    message: `Could not change password: ${toErrorMessage(err)}`
                };
                scheduleBadgeHide(7000);

                return false;
            }
        }}
        onProfileChange={async (name, image) => {
            profileSaveBadge = {
                kind: "saving",
                message: "Saving profile..."
            };
            clearHideBadgeTimeout();

            try {
                const formData = new FormData();
                formData.set("name", name.trim());

                if (image?.imageFile instanceof File) {
                    formData.set("image", image.imageFile, image.imageFile.name || "profile-image");
                }

                const authenticatedCallBackend = await fetchAuthenticated($page.url.pathname, {
                    method: "POST",
                    body: formData
                });

                if (!authenticatedCallBackend.ok) {
                    throw new Error(await toErrorMessageFromResponse(authenticatedCallBackend));
                }

                const responseBody = (await authenticatedCallBackend.json()) as {
                    user?: Profile;
                };

                if (responseBody.user) {
                    userProfile.set(responseBody.user);
                } else {
                    userProfile.update((currentProfile) => {
                        if (!currentProfile) return currentProfile;

                        return {
                            ...currentProfile,
                            name,
                            profileImgURL: image?.previewURL ?? currentProfile.profileImgURL
                        };
                    });
                }

                profileSaveBadge = {
                    kind: "success",
                    message: "Profile saved successfully."
                };
                scheduleBadgeHide();
            } catch (err) {
                profileSaveBadge = {
                    kind: "error",
                    message: `Could not save profile: ${toErrorMessage(err)}`
                };
                scheduleBadgeHide(7000);
            }
        }}
    />
</PageWrapper>
