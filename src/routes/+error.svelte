<script>
  import { page } from '$app/stores';
  import Icon from '@iconify/svelte';
  	import '../app.css'; // Ensure tailwind is loaded
</script>

<svelte:head>
  <title>Error - RavenLens</title>
</svelte:head>

<div class="w-full h-screen flex items-center justify-center bg-transparent py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-md w-full space-y-8">
    <div class="text-center">
      <Icon icon="heroicons:exclamation-triangle" width={50} height={50} class="mx-auto text-error" />
      <h2 class="mt-6 text-3xl font-extrabold text-base-content">
        {$page.status}: {$page.error?.message || 'An error occurred'}
      </h2>
      <p class="mt-2 text-sm text-base-content/60">
        {#if $page.status === 404}
          Sorry, we couldn't find the page you're looking for.
        {:else}
          Something went wrong. Please try again later.
        {/if}
      </p>
      <div class="mt-4">
        <a
          href="/"
          class="inline-flex items-center px-4 py-2 border border-base-300 text-sm font-medium rounded-md shadow-sm text-base-content hover:bg-base-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          <Icon icon="heroicons:home" class="w-4 h-4 mr-2" />
          Go back home
        </a>
      </div>
    </div>
  </div>
</div>
