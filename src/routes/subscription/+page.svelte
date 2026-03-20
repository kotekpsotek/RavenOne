<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { fetchAuthenticated } from "$lib/utils/fetch";
	import { onMount } from "svelte";
	import { setThemeMode, syncThemeMode, theme, type Themes } from "$lib/stores/theme";
	import { type SubscriptionPlan, plans } from "@ravenlens/shared";

	const themeOptions: Themes[] = ["light", "dark"];

	type StripeCheckoutPlan = NonNullable<SubscriptionPlan["stripePlanId"]>;
	type PlanPricesResponse = Record<StripeCheckoutPlan, number>;

	const usdCurrencyFormatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 2
	});

	let hasMounted = $state(false);
	let isLoadingPlanPrices = $state(true);
	let livePlanPrices = $state<Partial<PlanPricesResponse>>({});
	let checkoutPlanInProgress = $state<StripeCheckoutPlan | null>(null);
	let checkoutError = $state<string | null>(null);

	const currentTheme = $derived(hasMounted ? $theme : "light");
	const isDarkMode = $derived(currentTheme === "dark");

	onMount(() => {
		syncThemeMode();
		void loadLivePlanPrices();
		hasMounted = true;
	});

	function selectTheme(nextTheme: Themes) {
		if (currentTheme === nextTheme) {
			return;
		}

		setThemeMode(nextTheme);
	}

	function toErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}

		if (typeof error === "string") {
			return error;
		}

		try {
			return JSON.stringify(error);
		} catch {
			return String(error);
		}
	}

	function getDisplayPrice(plan: SubscriptionPlan): string {
		if (!plan.stripePlanId) {
			return plan.price;
		}

		const livePrice = livePlanPrices[plan.stripePlanId];
		if (typeof livePrice !== "number" || Number.isNaN(livePrice)) {
			return plan.price;
		}

		return usdCurrencyFormatter.format(livePrice);
	}

	async function loadLivePlanPrices() {
		isLoadingPlanPrices = true;

		try {
			const response = await fetchAuthenticated("/subscription/plans_prices", {
				method: "GET"
			});

			if (!response.ok) {
				return;
			}

			const responseBody = (await response.json()) as Partial<PlanPricesResponse>;
			livePlanPrices = responseBody;
		} catch {
			// Keep static plan.price labels when live Stripe prices are unavailable.
		} finally {
			isLoadingPlanPrices = false;
		}
	}

	async function onSelectPlan(plan: SubscriptionPlan) {
		if (plan.current || checkoutPlanInProgress) {
			return;
		}

		if (plan.price.toLowerCase() === "custom") {
			await goto("/subscription/contact-form");
			return;
		}

		if (!plan.stripePlanId) {
			if (plan.contactPath) {
				window.location.assign(plan.contactPath);
			}
			return;
		}

		checkoutError = null;
		checkoutPlanInProgress = plan.stripePlanId;

		try {
			const response = await fetchAuthenticated(
				"/subscription",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify({
						action: "checkout",
						planId: plan.stripePlanId,
						subscriptionKind: plan.kind
					})
				}
			);

			if (response.status === 401) {
				await goto("/auth/login");
				return;
			}

			const responseBody = (await response.json()) as {
				status?: boolean;
				error?: string;
				url?: string;
			};

			if (!response.ok || !responseBody.url) {
				throw new Error(responseBody.error ?? "Unable to start Stripe checkout");
			}

			window.location.assign(responseBody.url);
		} catch (error) {
			checkoutError = toErrorMessage(error);
		} finally {
			checkoutPlanInProgress = null;
		}
	}

</script>

<svelte:head>
	<title>Subscription Plans</title>
</svelte:head>

<section
	class={`relative min-h-screen flex items-center justify-center overflow-hidden p-[clamp(1.25rem,3vw,3rem)] max-[640px]:p-4 ${
		isDarkMode
			? "bg-[radial-gradient(circle_at_top_left,rgba(255,140,66,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(47,95,255,0.26),transparent_34%),linear-gradient(180deg,#04060b_0%,#0e1522_100%)] text-[#f8fafc]"
			: "bg-[radial-gradient(circle_at_top_left,rgba(255,157,81,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(32,83,235,0.16),transparent_32%),linear-gradient(180deg,#f7f8fb_0%,#edf2f7_100%)] text-[#111827]"
	}`}
	aria-labelledby="subscription-plans-heading"
>
	<div
		class="pointer-events-none absolute left-[-4rem] top-[-2rem] aspect-square w-[clamp(12rem,24vw,20rem)] rounded-full bg-[rgba(255,140,66,0.32)] opacity-[0.72] blur-[56px]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute bottom-[-4rem] right-[-2rem] aspect-square w-[clamp(12rem,24vw,20rem)] rounded-full bg-[rgba(43,97,255,0.26)] opacity-[0.72] blur-[56px]"
		aria-hidden="true"
	></div>

	<div
		class={`relative z-10 mx-auto w-full max-w-[1180px] rounded-[32px] border p-[clamp(1.25rem,2.4vw,2.25rem)] backdrop-blur-[24px] max-[960px]:rounded-[28px] max-[960px]:p-5 ${
			isDarkMode
				? "border-[rgba(148,163,184,0.14)] bg-[rgba(8,15,28,0.62)] shadow-[0_34px_90px_rgba(2,6,23,0.46)]"
				: "border-[rgba(148,163,184,0.18)] bg-white/[0.62] shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
		}`}
	>
		{#if isLoadingPlanPrices}
			<div class="flex min-h-[60vh] w-full items-center justify-center" aria-live="polite" aria-busy="true">
				<span
					class={`loading loading-spinner loading-lg ${isDarkMode ? "text-[#f8fafc]" : "text-[#1f2937]"}`}
					aria-label="Loading subscription prices"
				></span>
			</div>
		{:else}
		<header class="mb-7 flex items-end justify-between gap-4 max-[960px]:flex-col max-[960px]:items-stretch">
			<div>
				<h1
					id="subscription-plans-heading"
					class={`m-0 text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.04em] max-[640px]:text-[1.9rem] ${isDarkMode ? "text-[#f8fafc]" : "text-[#101828]"}`}
				>
					Subscription Plans
				</h1>
			</div>

			<div
				class={`inline-flex items-center gap-[0.45rem] rounded-full border p-1 backdrop-blur-[18px] max-[640px]:w-full max-[640px]:justify-between ${
					isDarkMode ? "border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,42,0.52)]" : "border-[rgba(148,163,184,0.24)] bg-white/[0.74]"
				}`}
				role="group"
				aria-label="Theme mode"
			>
				{#each themeOptions as themeOption (themeOption)}
					<button
						type="button"
						class={`inline-flex items-center gap-[0.55rem] rounded-full px-4 py-[0.72rem] text-[0.95rem] font-semibold transition duration-200 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[rgba(96,165,250,0.9)] max-[640px]:flex-1 max-[640px]:justify-center ${
							currentTheme === themeOption
								? isDarkMode
									? "bg-white/[0.14] text-[#f8fafc] shadow-[0_14px_28px_rgba(2,6,23,0.28)]"
									: "bg-[#111827] text-[#f8fafc] shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
								: isDarkMode
									? "text-[rgba(226,232,240,0.72)] hover:text-[#f8fafc]"
									: "text-[rgba(15,23,42,0.7)] hover:text-[#101828]"
						}`}
						aria-pressed={currentTheme === themeOption}
						onclick={() => selectTheme(themeOption)}
					>
						<Icon
							icon={themeOption === "light" ? "material-symbols:light-mode-outline-rounded" : "material-symbols:dark-mode-outline-rounded"}
							class="text-lg"
						/>
						<span>{themeOption === "light" ? "Light" : "Dark"}</span>
					</button>
				{/each}
			</div>
		</header>

		{#if checkoutError}
			<p
				class={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
					isDarkMode
						? "border-red-400/45 bg-red-500/15 text-red-100"
						: "border-red-300/70 bg-red-50 text-red-700"
				}`}
			>
				{checkoutError}
			</p>
		{/if}

		<div class="grid grid-cols-3 gap-[1.35rem] max-[960px]:grid-cols-1">
			{#each plans as plan (plan.name)}
				<article
					class={`relative flex min-h-full flex-col gap-[1.45rem] overflow-hidden rounded-[28px] border p-[1.6rem] transition duration-200 before:pointer-events-none before:absolute before:inset-3 before:content-[''] after:pointer-events-none after:absolute after:bottom-[75%] after:left-[-12%] after:w-48 after:aspect-square after:rounded-full after:blur-[36px] after:content-[''] max-[640px]:p-5 ${
						plan.current ? "opacity-95" : "hover:scale-[1.03]"
					} ${
						plan.featured
							? isDarkMode
								? "min-[961px]:-translate-y-[0.35rem] border-[rgba(103,144,255,0.3)] bg-[linear-gradient(160deg,#1f315c_0%,#050b16_100%)] shadow-[0_32px_84px_rgba(2,6,23,0.52)] before:border-white/[0.08] after:bg-[rgba(59,130,246,0.24)] after:opacity-100"
								: "min-[961px]:-translate-y-[0.35rem] border-[rgba(107,145,255,0.28)] bg-[linear-gradient(155deg,#1d2a40_0%,#050b16_100%)] shadow-[0_30px_80px_rgba(15,23,42,0.24)] before:border-white/[0.08] after:bg-[rgba(59,130,246,0.24)] after:opacity-100"
							: isDarkMode
								? "border-[rgba(148,163,184,0.14)] bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,8,23,0.94))] shadow-[0_28px_76px_rgba(2,6,23,0.38)] before:border-white/[0.05] after:bg-white/[0.04] after:opacity-70"
								: "border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.9))] shadow-[0_24px_60px_rgba(15,23,42,0.08)] before:border-white/[0.72] after:bg-white/[0.18] after:opacity-70"
					}`}
				>
					<div class="relative z-10 flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-start">
						<p class={`m-0 text-[1.35rem] font-semibold ${plan.featured || isDarkMode ? "text-[#f8fafc]" : "text-[#111827]"}`}>
							{plan.name}
						</p>
						{#if plan.badge}
							<span
								class={`inline-flex items-center gap-[0.45rem] whitespace-nowrap rounded-full border px-[0.72rem] py-[0.38rem] text-[0.76rem] font-extrabold uppercase tracking-[0.08em] before:h-[0.48rem] before:w-[0.48rem] before:rounded-full before:bg-current before:content-[''] ${
									plan.badgeTone === "warm"
										? "border-[rgba(255,146,60,0.2)] bg-[rgba(255,146,60,0.14)] text-[#ff922c]"
										: "border-[rgba(16,185,129,0.22)] bg-[rgba(16,185,129,0.12)] text-[#10b981]"
								}`}
							>
								{plan.badge}
							</span>
						{/if}
					</div>

					<div class="relative z-10 flex items-end gap-[0.4rem]">
						<span class={`text-[clamp(2rem,3vw,3rem)] font-semibold leading-none tracking-[-0.05em] max-[640px]:text-[2.4rem] ${plan.featured || isDarkMode ? "text-[#f8fafc]" : "text-[#111827]"}`}>
							{getDisplayPrice(plan)}
						</span>
						<span
							class={`pb-[0.3rem] text-base ${
								plan.featured
									? "text-[rgba(226,232,240,0.82)]"
									: isDarkMode
										? "text-[rgba(226,232,240,0.76)]"
										: "text-[rgba(51,65,85,0.84)]"
							}`}
						>
							{plan.billing}
						</span>
					</div>

					<button
						type="button"
						onclick={() => onSelectPlan(plan)}
						class={`relative z-10 w-full rounded-[16px] border p-3 text-[0.98rem] font-semibold transition duration-200 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[rgba(96,165,250,0.9)] disabled:cursor-default disabled:hover:translate-y-0 ${
							plan.actionTone === "muted"
								? isDarkMode
									? "border-[rgba(71,85,105,0.7)] bg-[rgba(30,41,59,0.94)] text-[#f8fafc]"
									: "border-[rgba(203,213,225,0.8)] bg-[rgba(226,232,240,0.92)] text-[#111827]"
								: plan.actionTone === "primary"
									? isDarkMode
										? "border-transparent bg-[#f8fafc] text-[#0f172a] shadow-[0_18px_36px_rgba(255,255,255,0.08)]"
										: "border-transparent bg-white text-[#0f172a] shadow-[0_18px_36px_rgba(255,255,255,0.18)]"
									: isDarkMode
										? "border-[rgba(148,163,184,0.16)] bg-[rgba(148,163,184,0.14)] text-[#f8fafc]"
										: "border-[rgba(31,41,55,0.9)] bg-[#1f2937] text-[#f8fafc]"
						}`}
						disabled={plan.current || checkoutPlanInProgress !== null}
					>
						{#if checkoutPlanInProgress === plan.stripePlanId}
							Redirecting...
						{:else}
							{plan.callToAction}
						{/if}
					</button>

					<ul
						class={`relative z-10 m-0 grid list-none gap-[0.9rem] p-0 ${
							plan.featured
								? "text-[rgba(226,232,240,0.82)]"
								: isDarkMode
									? "text-[rgba(226,232,240,0.76)]"
									: "text-[rgba(51,65,85,0.84)]"
						}`}
						aria-label={`${plan.name} features`}
					>
						{#each plan.features as feature (feature)}
							<li class="flex items-start gap-3 text-base leading-[1.55]">
								<span
									class={`mt-[0.12rem] inline-flex h-[1.35rem] w-[1.35rem] shrink-0 items-center justify-center rounded-full border ${
										plan.featured
											? "border-[rgba(148,163,184,0.18)] bg-white/[0.06] text-[rgba(248,250,252,0.86)]"
											: isDarkMode
												? "border-[rgba(148,163,184,0.18)] bg-white/[0.04] text-[rgba(226,232,240,0.74)]"
												: "border-[rgba(148,163,184,0.28)] bg-[rgba(15,23,42,0.04)] text-[#64748b]"
									}`}
									aria-hidden="true"
								>
									<Icon icon="material-symbols:check-small-rounded" />
								</span>
								<span>{feature}</span>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</div>
		{/if}
	</div>
</section>