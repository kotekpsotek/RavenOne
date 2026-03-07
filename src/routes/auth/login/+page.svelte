<script lang="ts">
  import Icon from '@iconify/svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { onAuthenticateWith } from '$lib/utils/auth';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount } from 'svelte';

  let { form } = $props();

  let rememberMe = $state(false);
  let isLoading = $state(false);
  let daisyTheme = $state<'light' | 'black'>('light');

  const AUTH_MODE = 'signin';

  const shellBaseClass = 'relative flex min-h-screen items-center justify-center overflow-hidden p-4';
  const shellLightClass = 'bg-gradient-to-br from-[#e5edf9] via-[#eef5ff] to-[#e8f6ff]';
  const shellDarkClass = 'bg-gradient-to-br from-[#07101d] via-[#0b1627] to-[#0a1a2a]';
  const patternLightClass =
    'pointer-events-none absolute inset-0 opacity-55 bg-[linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(circle_at_center,white_0%,rgba(255,255,255,0.8)_42%,transparent_75%)]';
  const patternDarkClass =
    'pointer-events-none absolute inset-0 opacity-80 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(circle_at_center,white_0%,rgba(255,255,255,0.8)_42%,transparent_75%)]';
  const cardBaseClass = 'relative z-10 w-full max-w-[30.75rem] rounded-2xl border p-8 backdrop-blur-xl';
  const cardLightClass =
    'border-slate-300/50 bg-white/85 shadow-[0_18px_48px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.08)]';
  const cardDarkClass =
    'border-slate-500/45 bg-slate-900/80 shadow-[0_20px_54px_rgba(2,6,23,0.48),0_2px_8px_rgba(2,6,23,0.24)]';
  const labelClass = 'mb-1.5 block text-[0.84rem] font-semibold';
  const inputBaseClass =
    'h-11 w-full rounded-lg border pl-10 pr-4 text-[0.95rem] outline-none transition focus:border-[#2153eb]/70 focus:ring-4 focus:ring-[#2153eb]/15';
  const inputLightClass = 'border-slate-400/75 bg-slate-200/80 text-slate-800 placeholder:text-slate-500';
  const inputDarkClass = 'border-slate-600 bg-slate-900/70 text-slate-200 placeholder:text-slate-400/70';

  onMount(() => {
    const storedTheme = localStorage.getItem('theme');
    daisyTheme = storedTheme === 'dark' ? 'black' : 'light';
  });

  const enhanceSignIn: SubmitFunction = () => {
    isLoading = true;

    return async ({ update }) => {
      try {
        await update();
      } finally {
        isLoading = false;
      }
    };
  };

  function handleRegisterNavigation(event: MouseEvent) {
    event.preventDefault();
    goto('/auth/register');
  }

  function preventForgotPasswordNavigation(event: MouseEvent) {
    event.preventDefault();
  }
</script>

<div class={[shellBaseClass, daisyTheme === 'black' ? shellDarkClass : shellLightClass]} data-theme={daisyTheme}>
  <div class={daisyTheme === 'black' ? patternDarkClass : patternLightClass} aria-hidden="true"></div>

  <div
    class="pointer-events-none absolute left-[-1rem] top-[-2rem] z-0 size-72 animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-[#2153eb]/25 blur-3xl"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute right-[-1rem] top-[-2rem] z-0 size-72 animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-sky-400/25 blur-3xl [animation-delay:2.4s]"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute bottom-[-3rem] left-24 z-0 size-72 animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-teal-400/25 blur-3xl [animation-delay:4.8s]"
    aria-hidden="true"
  ></div>

  <section class={[cardBaseClass, daisyTheme === 'black' ? cardDarkClass : cardLightClass]} aria-label="Sign in form">
    <div class="mb-6 flex justify-center">
      <img src="/ravenlens.svg" alt="RavenLens" class="block h-auto w-full max-w-[14rem]" />
    </div>

    <p class={[
      'mb-5 text-center text-[0.95rem]',
      daisyTheme === 'black' ? 'text-slate-400' : 'text-slate-500'
    ]}>
      Sign in to your account to continue
    </p>

    <form class="grid gap-4" method="POST" use:enhance={enhanceSignIn}>
      {#if form?.error}
        <p
          class={[
            'rounded-lg border px-3 py-2 text-[0.88rem] font-medium',
            daisyTheme === 'black'
              ? 'border-red-500/45 bg-red-500/15 text-red-100'
              : 'border-red-300/80 bg-red-50 text-red-700'
          ]}
        >
          {form.error}
        </p>
      {/if}

      <label for="email">
        <span class={[labelClass, daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500']}>
          Email address
        </span>
        <span class="relative flex items-center">
          <span
            class={[
              'pointer-events-none absolute left-3.5 inline-flex items-center justify-center',
              daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500'
            ]}
          >
            <Icon icon="heroicons:envelope" width="1.05rem" height="1.05rem" />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            required
            value={form?.values?.email ?? ''}
            class={[
              inputBaseClass,
              daisyTheme === 'black' ? inputDarkClass : inputLightClass
            ]}
            placeholder="name@example.com"
          />
        </span>
      </label>

      <label for="password">
        <span class={[labelClass, daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500']}>
          Password
        </span>
        <span class="relative flex items-center">
          <span
            class={[
              'pointer-events-none absolute left-3.5 inline-flex items-center justify-center',
              daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500'
            ]}
          >
            <Icon icon="heroicons:lock-closed" width="1.05rem" height="1.05rem" />
          </span>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            class={[
              inputBaseClass,
              daisyTheme === 'black' ? inputDarkClass : inputLightClass
            ]}
            placeholder="••••••••"
          />
        </span>
      </label>

      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label
          for="remember-me"
          class={[
            'inline-flex items-center gap-2 text-[0.9rem]',
            daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500'
          ]}
        >
          <input id="remember-me" name="remember-me" type="checkbox" bind:checked={rememberMe} class="size-[0.95rem] accent-[#2153eb]" />
          <span>Remember me</span>
        </label>

        <button
          type="button"
          class="border-0 bg-transparent p-0 text-left text-[0.9rem] font-semibold text-[#4f8fff] hover:text-[#2153eb] sm:text-right"
          onclick={preventForgotPasswordNavigation}
        >
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2153eb] px-4 text-[0.98rem] font-semibold text-white shadow-[0_12px_24px_rgba(33,83,235,0.22)] transition hover:bg-[#2b64f7] hover:shadow-[0_14px_28px_rgba(33,83,235,0.28)] disabled:cursor-wait disabled:opacity-80"
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true"></span>
          <span>Signing in...</span>
        {:else}
          <Icon icon="heroicons:arrow-right-on-rectangle" width="1.05rem" height="1.05rem" />
          <span>Sign in</span>
        {/if}
      </button>
    </form>

    <div class="relative my-6 text-center text-[0.92rem]">
      <div class={[
        'absolute inset-x-0 top-1/2 h-px -translate-y-1/2',
        daisyTheme === 'black' ? 'bg-slate-500/50' : 'bg-slate-400/55'
      ]}></div>
      <span class={[
        'relative px-4',
        daisyTheme === 'black' ? 'bg-slate-900/80 text-slate-400' : 'bg-white/85 text-slate-500'
      ]}>
        Or continue with
      </span>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <button
        type="button"
        class={[
          'inline-flex min-h-[2.55rem] items-center justify-center rounded-xl border transition hover:-translate-y-px',
          daisyTheme === 'black'
            ? 'border-slate-500/50 bg-slate-900/70 hover:bg-slate-900/90'
            : 'border-slate-500/45 bg-white/80 hover:border-[#2153eb]/45 hover:bg-white/95'
        ]}
        aria-label="Continue with Google"
        onclick={onAuthenticateWith('google', AUTH_MODE)}
      >
        <Icon icon="logos:google-icon" width="1.05rem" height="1.05rem" />
      </button>
      <button
        type="button"
        class={[
          'inline-flex min-h-[2.55rem] items-center justify-center rounded-xl border transition hover:-translate-y-px',
          daisyTheme === 'black'
            ? 'border-slate-500/50 bg-slate-900/70 hover:bg-slate-900/90'
            : 'border-slate-500/45 bg-white/80 hover:border-[#2153eb]/45 hover:bg-white/95'
        ]}
        aria-label="Continue with LinkedIn"
        onclick={onAuthenticateWith('linkedin', AUTH_MODE)}
      >
        <Icon icon="logos:linkedin-icon" width="1.05rem" height="1.05rem" />
      </button>
      <button
        type="button"
        class={[
          'inline-flex min-h-[2.55rem] items-center justify-center rounded-xl border transition hover:-translate-y-px',
          daisyTheme === 'black'
            ? 'border-slate-500/50 bg-slate-900/70 hover:bg-slate-900/90'
            : 'border-slate-500/45 bg-white/80 hover:border-[#2153eb]/45 hover:bg-white/95'
        ]}
        aria-label="Continue with GitHub"
        onclick={onAuthenticateWith('github', AUTH_MODE)}
      >
        <Icon icon="logos:github-icon" width="1.05rem" height="1.05rem" class={daisyTheme === 'black' ? 'invert' : ''} />
      </button>
    </div>

    <p class={[
      'mt-6 flex items-center justify-center gap-1 text-[0.92rem]',
      daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-500'
    ]}>
      <span>Don't have an account?</span>
      <a
        href="/auth/register"
        class="inline-flex items-center gap-1 font-semibold text-[#2153eb] hover:underline hover:underline-offset-2"
        onclick={handleRegisterNavigation}
      >
        <Icon icon="heroicons:user-plus" width="1.05rem" height="1.05rem" />
        <span>Sign up</span>
      </a>
    </p>
  </section>
</div>