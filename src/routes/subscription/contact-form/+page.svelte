<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { setThemeMode, syncThemeMode, theme, type Themes } from "$lib/stores/theme";

	type ContactFormField = "fullName" | "email" | "companyName" | "companySize";
	type ContactFormFieldErrors = Partial<Record<ContactFormField, string>>;

	type ContactFormResponse = {
		status?: boolean;
		message?: string;
		error?: string;
		fieldErrors?: ContactFormFieldErrors;
	};

	const themeOptions: Themes[] = ["light", "dark"];
	const MIN_COMPANY_SIZE = 1;
	const MAX_COMPANY_SIZE = 1000;

	let hasMounted = $state(false);
	let fullName = $state("");
	let email = $state("");
	let companyName = $state("");
	let companySize = $state(24);
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let submitSuccess = $state<string | null>(null);
	let fieldErrors = $state<ContactFormFieldErrors>({});

	const currentTheme = $derived(hasMounted ? $theme : "light");
	const isDarkMode = $derived(currentTheme === "dark");
	const normalizedFullName = $derived(fullName.trim());
	const normalizedEmail = $derived(email.trim());
	const normalizedCompanyName = $derived(companyName.trim());
	const isFormComplete = $derived(
		normalizedFullName.length > 0 &&
			normalizedEmail.length > 0 &&
			normalizedCompanyName.length > 0 &&
			typeof companySize === "number" &&
			Number.isFinite(companySize) &&
			companySize >= MIN_COMPANY_SIZE &&
			companySize <= MAX_COMPANY_SIZE
	);
	const companySizeLabel = $derived(companySize >= MAX_COMPANY_SIZE ? `${MAX_COMPANY_SIZE}+` : `${companySize}`);

	onMount(() => {
		syncThemeMode();
		hasMounted = true;
	});

	function selectTheme(nextTheme: Themes) {
		if (currentTheme === nextTheme) {
			return;
		}

		setThemeMode(nextTheme);
	}

	function clearFieldError(field: keyof ContactFormFieldErrors) {
		if (!fieldErrors[field]) {
			return;
		}

		const { [field]: _removed, ...rest } = fieldErrors;
		fieldErrors = rest;
	}

	function resetFormValues() {
		fullName = "";
		email = "";
		companyName = "";
		companySize = 24;
	}

	function validateClientForm(): boolean {
		const nextFieldErrors: ContactFormFieldErrors = {};

		if (!normalizedFullName) {
			nextFieldErrors.fullName = "Full name is required";
		}

		if (!normalizedEmail) {
			nextFieldErrors.email = "Email is required";
		}

		if (!normalizedCompanyName) {
			nextFieldErrors.companyName = "Company name is required";
		}

		if (
			!Number.isFinite(companySize) ||
			companySize < MIN_COMPANY_SIZE ||
			companySize > MAX_COMPANY_SIZE
		) {
			nextFieldErrors.companySize = `Company size has to be between ${MIN_COMPANY_SIZE} and ${MAX_COMPANY_SIZE}`;
		}

		fieldErrors = nextFieldErrors;
		return Object.keys(nextFieldErrors).length === 0;
	}

	async function submitContactForm(event: SubmitEvent) {
		event.preventDefault();
		submitError = null;
		submitSuccess = null;

		if (!validateClientForm()) {
			submitError = "Please complete all required fields.";
			return;
		}

		isSubmitting = true;

		try {
			const formData = new FormData();
			formData.set("fullName", normalizedFullName);
			formData.set("email", normalizedEmail);
			formData.set("companyName", normalizedCompanyName);
			formData.set("companySize", String(companySize));

			const response = await fetch("/subscription/contact-form", {
				method: "POST",
				body: formData
			});

			let responseBody: ContactFormResponse;
			try {
				responseBody = (await response.json()) as ContactFormResponse;
			} catch {
				responseBody = {
					status: false,
					error: "The server returned an unexpected response"
				};
			}

			if (!response.ok || !responseBody.status) {
				fieldErrors = responseBody.fieldErrors ?? {};
				submitError = responseBody.error ?? "Unable to submit the contact request";
				return;
			}

			submitSuccess = responseBody.message ?? "Your request was submitted successfully.";
			fieldErrors = {};
			resetFormValues();
		} catch {
			submitError = "Unable to submit your request right now. Please try again.";
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Enterprise Contact Form</title>
</svelte:head>

<section
	class={`relative min-h-screen overflow-hidden p-[clamp(1.25rem,3vw,3rem)] ${
		isDarkMode
			? "bg-[radial-gradient(circle_at_top_left,rgba(255,140,66,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(43,97,255,0.22),transparent_36%),linear-gradient(180deg,#04060b_0%,#0e1522_100%)] text-[#f8fafc]"
			: "bg-[radial-gradient(circle_at_top_left,rgba(255,157,81,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(32,83,235,0.15),transparent_32%),linear-gradient(180deg,#f7f8fb_0%,#edf2f7_100%)] text-[#111827]"
	}`}
	aria-labelledby="enterprise-contact-heading"
>
	<div
		class="pointer-events-none absolute left-[-4rem] top-[-2rem] aspect-square w-[clamp(12rem,24vw,20rem)] rounded-full bg-[rgba(255,140,66,0.3)] opacity-[0.72] blur-[56px]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute bottom-[-4rem] right-[-2rem] aspect-square w-[clamp(12rem,24vw,20rem)] rounded-full bg-[rgba(43,97,255,0.24)] opacity-[0.72] blur-[56px]"
		aria-hidden="true"
	></div>

	<div class="relative z-10 mx-auto w-full max-w-3xl">
		<div
			class={`card border backdrop-blur-[24px] ${
				isDarkMode
					? "border-[rgba(148,163,184,0.14)] bg-[rgba(8,15,28,0.66)] shadow-[0_34px_90px_rgba(2,6,23,0.46)]"
					: "border-[rgba(148,163,184,0.18)] bg-white/[0.7] shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
			}`}
		>
			<div class="card-body gap-6 p-[clamp(1.25rem,2.6vw,2.2rem)]">
				<header class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<p class={`mb-2 text-xs font-semibold uppercase tracking-[0.08em] ${isDarkMode ? "text-[#94a3b8]" : "text-[#475569]"}`}>
							Enterprise Plan
						</p>
						<h1
							id="enterprise-contact-heading"
							class={`m-0 text-[clamp(1.7rem,3vw,2.35rem)] font-semibold tracking-[-0.03em] ${isDarkMode ? "text-[#f8fafc]" : "text-[#101828]"}`}
						>
							Talk To Sales
						</h1>
						<p class={`mt-2 max-w-[42ch] text-sm leading-relaxed ${isDarkMode ? "text-[rgba(226,232,240,0.76)]" : "text-[rgba(51,65,85,0.9)]"}`}>
							Tell us about your team and we will prepare a custom subscription offer.
						</p>
					</div>

					<div
						class={`inline-flex items-center gap-1 rounded-full border p-1 ${
							isDarkMode
								? "border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,42,0.52)]"
								: "border-[rgba(148,163,184,0.24)] bg-white/[0.74]"
						}`}
						role="group"
						aria-label="Theme mode"
					>
						{#each themeOptions as themeOption (themeOption)}
							<button
								type="button"
								class={`btn btn-sm rounded-full border-0 ${
									currentTheme === themeOption
										? isDarkMode
											? "bg-white/[0.14] text-[#f8fafc]"
											: "bg-[#111827] text-[#f8fafc]"
										: isDarkMode
											? "bg-transparent text-[rgba(226,232,240,0.72)]"
											: "bg-transparent text-[rgba(15,23,42,0.7)]"
								}`}
								aria-pressed={currentTheme === themeOption}
								onclick={() => selectTheme(themeOption)}
							>
								<Icon
									icon={themeOption === "light" ? "material-symbols:light-mode-outline-rounded" : "material-symbols:dark-mode-outline-rounded"}
									class="text-base"
								/>
							</button>
						{/each}
					</div>
				</header>

				<form class="grid gap-4" onsubmit={submitContactForm} novalidate>
					{#if submitError}
						<div class="alert alert-error">
							<Icon icon="material-symbols:error-outline-rounded" class="text-lg" />
							<span>{submitError}</span>
						</div>
					{/if}

					{#if submitSuccess}
						<div class="alert alert-success">
							<Icon icon="material-symbols:check-circle-outline-rounded" class="text-lg" />
							<span>{submitSuccess}</span>
						</div>
					{/if}

					<label class="form-control w-full gap-1" for="contact-full-name">
						<span class={`label-text text-sm font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-[#1f2937]"}`}>
							Full name *
						</span>
						<input
							id="contact-full-name"
							name="fullName"
							type="text"
							class={`input input-bordered w-full ${isDarkMode ? "bg-slate-900/70 text-slate-100" : "bg-white text-slate-900"}`}
							placeholder="John Doe"
							bind:value={fullName}
							oninput={() => clearFieldError("fullName")}
							required
						/>
						{#if fieldErrors.fullName}
							<span class="label-text-alt text-error">{fieldErrors.fullName}</span>
						{/if}
					</label>

					<label class="form-control w-full gap-1" for="contact-email">
						<span class={`label-text text-sm font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-[#1f2937]"}`}>
							Email *
						</span>
						<input
							id="contact-email"
							name="email"
							type="email"
							class={`input input-bordered w-full ${isDarkMode ? "bg-slate-900/70 text-slate-100" : "bg-white text-slate-900"}`}
							placeholder="name@company.com"
							bind:value={email}
							oninput={() => clearFieldError("email")}
							required
						/>
						{#if fieldErrors.email}
							<span class="label-text-alt text-error">{fieldErrors.email}</span>
						{/if}
					</label>

					<label class="form-control w-full gap-1" for="contact-company-name">
						<span class={`label-text text-sm font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-[#1f2937]"}`}>
							Company name *
						</span>
						<input
							id="contact-company-name"
							name="companyName"
							type="text"
							class={`input input-bordered w-full ${isDarkMode ? "bg-slate-900/70 text-slate-100" : "bg-white text-slate-900"}`}
							placeholder="ABC Inc."
							bind:value={companyName}
							oninput={() => clearFieldError("companyName")}
							required
						/>
						{#if fieldErrors.companyName}
							<span class="label-text-alt text-error">{fieldErrors.companyName}</span>
						{/if}
					</label>

					<label class="form-control w-full gap-2" for="contact-company-size">
						<div class="flex items-center justify-between gap-3">
							<span class={`label-text text-sm font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-[#1f2937]"}`}>
								Company size *
							</span>
							<div
								class={`badge badge-outline flex items-center gap-1.5 px-3 py-3.5 text-xs font-medium transition-all ${
									isDarkMode ? "border-slate-700 bg-slate-900/40 text-slate-200" : "border-slate-300 bg-slate-50 text-slate-700"
								}`}
							>
								<input
									type="number"
									class="w-9 border-none bg-transparent p-0 text-right font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									bind:value={companySize}
									min={MIN_COMPANY_SIZE}
									max={MAX_COMPANY_SIZE}
									oninput={() => clearFieldError("companySize")}
								/>
								<span class="opacity-70">people</span>
							</div>
						</div>
						<input
							id="contact-company-size"
							name="companySize"
							type="range"
							class="range w-full range-primary"
							bind:value={companySize}
							min={MIN_COMPANY_SIZE}
							max={MAX_COMPANY_SIZE}
							step={1}
							oninput={() => clearFieldError("companySize")}
							required
						/>
						<div class={`flex justify-between text-xs ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
							<span>{MIN_COMPANY_SIZE}</span>
							<span>{Math.floor(MAX_COMPANY_SIZE / 2)}</span>
							<span>{MAX_COMPANY_SIZE}+</span>
						</div>
						{#if fieldErrors.companySize}
							<span class="label-text-alt text-error">{fieldErrors.companySize}</span>
						{/if}
					</label>

					<div class="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
						<button
							type="button"
							class={`btn btn-ghost ${isDarkMode ? "text-slate-200" : "text-slate-700"}`}
							onclick={() => goto("/subscription")}
						>
							Back to plans
						</button>
						<button
							type="submit"
							class="btn btn-primary"
							disabled={isSubmitting || !isFormComplete}
						>
							{#if isSubmitting}
								<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
								Sending...
							{:else}
								Send contact request
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</section>
