<script lang="ts">
  import Icon from '@iconify/svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { JWTAuth } from '$lib/utils/auth';
  import { onMount } from 'svelte';
    import { appName } from '$lib/config/app';

  let countdown = $state(5);
  let status = $state<'loading' | 'success' | 'error'>('loading');
  let message = $state('Authenticating...');
  let subMessage = $state('Please wait while we set up your session.');
  let daisyTheme = $state<'light' | 'black'>('light');

  const shellBaseClass = 'relative flex min-h-screen items-center justify-center overflow-hidden p-4';
  const shellLightClass = 'bg-gradient-to-br from-[#e5edf9] via-[#eef5ff] to-[#e8f6ff]';
  const shellDarkClass = 'bg-gradient-to-br from-[#07101d] via-[#0b1627] to-[#0a1a2a]';
  const patternLightClass =
    'pointer-events-none absolute inset-0 opacity-55 bg-[linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(circle_at_center,white_0%,rgba(255,255,255,0.8)_42%,transparent_75%)]';
  const patternDarkClass =
    'pointer-events-none absolute inset-0 opacity-80 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(circle_at_center,white_0%,rgba(255,255,255,0.8)_42%,transparent_75%)]';
  const cardBaseClass = 'relative z-10 w-full max-w-[30.75rem] rounded-2xl border p-8 text-center backdrop-blur-xl';
  const cardLightClass =
    'border-slate-300/50 bg-white/85 shadow-[0_18px_48px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.08)]';
  const cardDarkClass =
    'border-slate-500/45 bg-slate-900/80 shadow-[0_20px_54px_rgba(2,6,23,0.48),0_2px_8px_rgba(2,6,23,0.24)]';

  onMount(() => {
    const storedTheme = localStorage.getItem('theme');
    daisyTheme = storedTheme === 'dark' ? 'black' : 'light';

    const token = $page.url.searchParams.get('token');
    const errorMessage = $page.url.searchParams.get('error');

    if (token) {
      JWTAuth.setToken(token);

      status = 'success';
      message = 'Successfully Authenticated!';
      subMessage = 'Your session has been established. You will be redirected to the dashboard shortly.';
    } else if (errorMessage) {
      status = 'error';
      message = 'Authentication Error';
      subMessage = errorMessage.replace(/^["'](.+)["']$/, '$1');
    } else {
      status = 'error';
      message = 'Authentication Failed';
      subMessage = 'No authentication token was found in the request. Redirecting you home...';
    }

    const interval = setInterval(() => {
      countdown -= 1;

      if (countdown <= 0) {
        clearInterval(interval);
        goto('/');
      }
    }, 1000);

    return () => clearInterval(interval);
  });
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

  <section class={[cardBaseClass, daisyTheme === 'black' ? cardDarkClass : cardLightClass]} aria-label="Authentication callback status">
    <div class="mb-8 flex justify-center">
      <img src="/ravenlens.svg" alt="{appName}" class="block h-auto w-full max-w-[14rem]" />
    </div>

    <div class="mb-6 flex justify-center">
      {#if status === 'loading'}
        <div class="size-20 animate-spin rounded-full border-4 border-[#2153eb]/20 border-t-[#2153eb]"></div>
      {:else if status === 'success'}
        <div class="flex size-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/25">
          <Icon icon="heroicons:check-circle" width="2.9rem" height="2.9rem" />
        </div>
      {:else}
        <div class="flex size-20 items-center justify-center rounded-full bg-red-500/20 text-red-500 shadow-lg shadow-red-500/25">
          <Icon icon="heroicons:exclamation-circle" width="2.9rem" height="2.9rem" />
        </div>
      {/if}
    </div>

    <h1 class={[
      'mb-3 text-2xl font-bold',
      daisyTheme === 'black' ? 'text-slate-100' : 'text-slate-900'
    ]}>
      {message}
    </h1>
    <p class={[
      'mb-10 leading-relaxed',
      daisyTheme === 'black' ? 'text-slate-400' : 'text-slate-500'
    ]}>
      {subMessage}
    </p>

    <div class="flex flex-col items-center gap-6">
      <div class={[
        'flex items-center gap-3 rounded-full border px-6 py-3',
        daisyTheme === 'black' ? 'border-slate-600 bg-slate-900/55' : 'border-slate-300/80 bg-slate-100/70'
      ]}>
        <div class="flex gap-1">
          <span class="size-2 animate-bounce rounded-full bg-[#2153eb] [animation-delay:0ms]"></span>
          <span class="size-2 animate-bounce rounded-full bg-[#2153eb] [animation-delay:150ms]"></span>
          <span class="size-2 animate-bounce rounded-full bg-[#2153eb] [animation-delay:300ms]"></span>
        </div>
        <span class={[
          'text-sm font-medium',
          daisyTheme === 'black' ? 'text-slate-300' : 'text-slate-700'
        ]}>
          Redirecting in <span class="text-lg font-bold tabular-nums text-[#2153eb]">{countdown}</span> seconds
        </span>
      </div>

      <button
        type="button"
        onclick={() => goto('/')}
        class={[
          'text-sm font-medium transition hover:underline hover:underline-offset-4',
          daisyTheme === 'black' ? 'text-slate-400 hover:text-[#4f8fff]' : 'text-slate-500 hover:text-[#2153eb]'
        ]}
      >
        Click here to redirect manually
      </button>
    </div>
  </section>
</div>


