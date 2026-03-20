<script lang="ts">
  import Icon from "@iconify/svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import type { HelpMaterial } from "@ravenlens/shared";
  import { UI } from "@ravenlens/frontend";
  import { theme } from "$lib/stores/theme";

  let searchQuery = "";

  // Raw materials with publication dates as ISO strings. We'll convert to Date and mark the top 3 newest as `isRecent`.
  // FIXME: Replace with real data
  const rawMaterials = [
    {
      title: "Getting Started Guide",
      description:
        "Step-by-step guide to set up your RavenLens account and workspace.",
      imgURL: "https://picsum.photos/id/1015/640/360",
      category: "getting-started",
      publicationDate: "2025-12-15",
    },
    {
      title: "Create Your First Project",
      description:
        "How to create a project, invite collaborators, and set initial tasks.",
      imgURL: "https://picsum.photos/id/1016/640/360",
      category: "getting-started",
      publicationDate: "2025-12-01",
    },
    {
      title: "Managing Tasks",
      description:
        "Tips for creating, assigning, and tracking tasks effectively.",
      imgURL: "https://picsum.photos/id/1025/640/360",
      category: "tasks",
      publicationDate: "2025-11-20",
    },
    {
      title: "Customizing Theme",
      description: "Change light/dark mode, colors, and layout preferences.",
      imgURL: "https://picsum.photos/id/1027/640/360",
      category: "customization",
      publicationDate: "2025-10-05",
    },
    {
      title: "Account Security",
      description:
        "Update passwords, enable 2FA, and review security settings.",
      imgURL: "https://picsum.photos/id/1035/640/360",
      category: "faq",
      publicationDate: "2025-09-12",
    },
    {
      title: "Integrations Overview",
      description:
        "Connect Slack, Google Calendar, and other third-party apps.",
      imgURL: "https://picsum.photos/id/1037/640/360",
      category: "integrations",
      publicationDate: "2025-08-22",
    },
    {
      title: "Using Analytics",
      description: "Access dashboards and reports to monitor project health.",
      imgURL: "https://picsum.photos/id/1041/640/360",
      category: "analytics",
      publicationDate: "2025-11-02",
    },
    {
      title: "Templates & Workflows",
      description: "Use templates to speed up common project setups.",
      imgURL: "https://picsum.photos/id/1052/640/360",
      category: "templates",
      publicationDate: "2025-07-30",
    },
    {
      title: "Exporting Data",
      description: "Export reports and project data in CSV or PDF formats.",
      imgURL: "https://picsum.photos/id/1062/640/360",
      category: "faq",
      publicationDate: "2025-06-15",
    },
    {
      title: "Troubleshooting & Support",
      description: "Common issues and how to contact support or request help.",
      imgURL: "https://picsum.photos/id/1069/640/360",
      category: "faq",
      publicationDate: "2025-05-10",
    },
  ];

  // Convert rawMaterials into typed HelpMaterial[] and mark the top-3 newest as `isRecent`
  let helpMaterials: HelpMaterial[] = rawMaterials.map((r) => ({
    ...r,
    /** FIXME: Change to real help material*/
    id: "test",
    publicationDate: new Date(r.publicationDate),
  }));

  // Determine cutoff date for "freshest" (top 3 newest) materials
  const sortedByDate = [...helpMaterials].sort(
    (a, b) => b.publicationDate.getTime() - a.publicationDate.getTime(),
  );
  const recentCutoff =
    sortedByDate.length >= 3
      ? sortedByDate[2].publicationDate
      : (sortedByDate[sortedByDate.length - 1]?.publicationDate ?? new Date(0));

  const groupCategories: { id: string; title: string; isDefault?: boolean }[] =
    [
      { id: "recent", title: "Recent", isDefault: true },
      { id: "getting-started", title: "Getting started" },
      { id: "faq", title: "FAQ" },
    ];

  // Filter / Sorting / Grouping
  // default active group is the one marked `isDefault` in `groupCategories`
  let activeGroupId: string =
    groupCategories.find((g) => g.isDefault)?.id ?? "all";

  // Compute prioritized list: items that match the active group appear first.
  $: prioritizedMaterials = (() => {
    if (!activeGroupId || activeGroupId === "all") {
      // Show freshest first across all materials
      return [...helpMaterials].sort(
        (a, b) => b.publicationDate.getTime() - a.publicationDate.getTime(),
      );
    }

    if (activeGroupId === "recent") {
      // Show freshest first when 'Recent' group selected
      return [...helpMaterials].sort(
        (a, b) => b.publicationDate.getTime() - a.publicationDate.getTime(),
      );
    }

    // For a specific category: prioritize matching category, then by publicationDate (newest first)
    return [...helpMaterials].sort((a, b) => {
      const aPriority = a.category === activeGroupId ? 1 : 0;
      const bPriority = b.category === activeGroupId ? 1 : 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      return b.publicationDate.getTime() - a.publicationDate.getTime();
    });
  })();

  function getGroupTitle(id: string) {
    return groupCategories.find((g) => g.id === id)?.title ?? "";
  }

  function countForGroup(id: string) {
    if (id === "all") return helpMaterials.length;
    if (id === "recent")
      return helpMaterials.filter(
        (m) => m.publicationDate.getTime() >= recentCutoff.getTime(),
      ).length;
    return helpMaterials.filter((m) => m.category === id).length;
  }

  let searchBox: HTMLDivElement | null = null;
  let suggestionsOpen = false;
  let addNewMaterial = false;

  // Material context menu (right click)
  let materialMenuOpen = false;
  let materialMenuX = 0;
  let materialMenuY = 0;
  let materialMenuTarget: HelpMaterial | null = null;

  function closeMaterialMenu() {
    materialMenuOpen = false;
    materialMenuTarget = null;
  }

  function openMaterialMenu(e: MouseEvent, material: HelpMaterial) {
    // Right-click should open a small popover menu instead of the browser context menu.
    e.preventDefault();
    e.stopPropagation();

    // Approximate menu size and clamp inside viewport.
    const MENU_W = 220;
    const MENU_H = 96;
    const padding = 8;
    materialMenuX = Math.max(
      padding,
      Math.min(e.clientX, window.innerWidth - MENU_W - padding),
    );
    materialMenuY = Math.max(
      padding,
      Math.min(e.clientY, window.innerHeight - MENU_H - padding),
    );
    materialMenuTarget = material;
    materialMenuOpen = true;
  }

  async function onEditMaterial() {
    if (!materialMenuTarget) return;
    const id = materialMenuTarget.id;
    closeMaterialMenu();
    await goto(`/help-materials/material/${id}?edit=1`);
  }

  onMount(() => {
    const onWindowPointerDown = (e: Event) => {
      if (!materialMenuOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-help-material-menu="true"]')) return;
      closeMaterialMenu();
    };

    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMaterialMenu();
    };

    window.addEventListener("pointerdown", onWindowPointerDown, true);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("scroll", closeMaterialMenu, true);
    window.addEventListener("resize", closeMaterialMenu);

    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown, true);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("scroll", closeMaterialMenu, true);
      window.removeEventListener("resize", closeMaterialMenu);
    };
  });

  function handleFocusOut(e: FocusEvent) {
    const related = e.relatedTarget as Node | null;
    if (!related || !searchBox || !searchBox.contains(related)) {
      suggestionsOpen = false;
    }
  }

  function handleSearch() {
    // TODO: wire to real search behavior. For now close suggestions and log.
    suggestionsOpen = false;
    console.log("Search for:", searchQuery);
  }

  function handleAskAI() {
    // TODO: call AI assistant flow. For now close suggestions and log.
    suggestionsOpen = false;
    console.log("Ask AI for:", searchQuery);
  }

  function handleAskSupport() {
    suggestionsOpen = false;
  }

  function onAddNewMaterial() {
    const localPage = $page;
    const url = new URL(localPage.url);
    url.pathname += "/add";

    window.open(url);
  }

  function onOpenMaterial(material: HelpMaterial) {
    return async (ev: Event) => {
      await goto("/help-materials/material/" + material.id);
    };
  }
</script>

<UI.Common.PageWrapper flexLayout="column" additionalClass="p-10 h-full overflow-y-auto">
  <UI.Common.PageTitleCard
    icons={[
      {
        name: "material-symbols:video-chat-outline-rounded",
        classAllocation: "bottom-0 left-0 w-16 h-16",
        color: $theme === "dark" ? "white" : "",
      },
      {
        name: "material-symbols:help-outline-rounded",
        classAllocation: "top-0 right-0 w-16 h-16",
        color: $theme === "dark" ? "white" : "",
      },
    ]}
    cardName="Help"
  >
    <svelte:fragment slot="description">
      Meet materials will help in any task accomplishement on RavenOne
    </svelte:fragment>

    <svelte:fragment slot="buttons">
      {#if $page.url.searchParams.has("admin")}
        <button class="btn btn-primary" on:click={onAddNewMaterial}>
          <Icon icon="material-symbols:add-2-rounded" />
          <span> Add New Material </span>
        </button>
      {/if}
    </svelte:fragment>
  </UI.Common.PageTitleCard>

  <div class="p-2 flex flex-col gap-8 w-full relative">
    <!-- TODO: This has to be shown only to permitted member -->
    {#if materialMenuOpen && materialMenuTarget}
      <!-- DaisyUI dropdown (context menu) -->
      <div
        class="dropdown dropdown-open"
        data-help-material-menu="true"
        style="position: fixed; left: {materialMenuX}px; top: {materialMenuY}px; z-index: 60;"
      >
        <ul
          class="dropdown-content menu bg-base-100 border border-base-200 rounded-box w-48 p-2 shadow"
        >
          <li>
            <button
              class="btn btn-ghost justify-start"
              on:click={onEditMaterial}
            >
              <Icon
                icon="material-symbols:edit-outline-rounded"
                width="18"
                height="18"
              />
              <span>Edit</span>
            </button>
          </li>
        </ul>
      </div>
    {/if}

    <div
      class="w-full relative"
      bind:this={searchBox}
      on:focusin={() => (suggestionsOpen = true)}
      on:focusout={handleFocusOut}
    >
      <label class="input w-full flex items-center gap-3">
        <Icon icon="material-symbols:search-rounded" width="20" height="20" />
        <input
          class="w-full bg-transparent outline-none"
          type="search"
          bind:value={searchQuery}
          placeholder="Search..." /* Ask a question or search */
          aria-label="Search help"
          on:keydown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
        />
      </label>

      <!-- Interaction kind tray TODO: Cover AI and Search -> Only when user has typed sth -->
       <!-- TODO: Uncomment and cover functionality -->
      <!-- {#if suggestionsOpen}
        <div class="absolute left-0 right-0 mt-2 z-50">
          <div
            class="card bg-base-100 border border-base-200 shadow-sm rounded-lg overflow-hidden"
          >
            <div class="p-3">
              <div class="text-sm text-base-content/60 mb-2">Quick actions</div>
              <div class="flex flex-col gap-2">
                <button
                  class="btn btn-ghost gap-2 justify-start normal-case border-0"
                  on:mousedown|preventDefault={handleSearch}
                >
                  <Icon
                    icon="material-symbols:search-rounded"
                    width="20"
                    height="20"
                  />
                  <div class="text">
                    <div class="flex flex-col text-left">
                      <span class="font-medium"
                        >Search: "{searchQuery || "recent..."}"</span
                      >
                      <span class="text-xs font-thin opacity-60"
                        >Look for matching help articles and guides</span
                      >
                    </div>
                  </div>
                </button>

                <button
                  class="btn btn-ghost gap-2 justify-start normal-case border-0"
                  on:mousedown|preventDefault={handleAskAI}
                >
                  <Icon
                    icon="material-symbols:wand-stars-outline-rounded"
                    width="20"
                    height="20"
                  />
                  <div class="text">
                    <div class="flex flex-col text-left">
                      <span class="font-medium"
                        >Ask AI for: "{searchQuery || "something..."}"</span
                      >
                      <span class="text-xs font-thin opacity-60"
                        >Get an AI-written answer or suggested steps</span
                      >
                    </div>
                  </div>
                </button>

                <button
                  class="btn btn-ghost gap-2 justify-start normal-case border-0"
                  on:mousedown|preventDefault={handleAskSupport}
                >
                  <Icon
                    icon="material-symbols:support-agent"
                    width="20"
                    height="20"
                  />
                  <div class="text">
                    <div class="flex flex-col text-left">
                      <span class="font-medium"
                        >Ask Support for: "{searchQuery ||
                          "yr question..."}"</span
                      >
                      <span class="text-xs font-thin opacity-60"
                        >Ask RavenLens support to obtain fast and professional
                        reply</span
                      >
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if} -->
    </div>

    <!-- Group selector: selecting a group will prioritize its items and mark them with a badge -->
    <div
      class="materials-selection border border-base-200 rounded-lg p-3 flex flex-wrap gap-2"
    >
      {#each groupCategories as group}
        <button
          class="btn btn-sm normal-case flex items-center gap-2"
          class:btn-primary={group.id === activeGroupId}
          class:btn-ghost={group.id !== activeGroupId}
          on:click={() => (activeGroupId = group.id)}
        >
          <span>{group.title}</span>
          <span class="badge badge-xs ml-1">{countForGroup(group.id)}</span>
        </button>
      {/each}

      <button
        class="btn btn-sm normal-case flex items-center gap-2"
        class:btn-primary={activeGroupId === "all"}
        class:btn-ghost={activeGroupId !== "all"}
        on:click={() => (activeGroupId = "all")}
      >
        <span>All</span>
        <span class="badge badge-xs ml-1">{countForGroup("all")}</span>
      </button>
    </div>

    <!-- Help Materials -->
    <div
      id="help-materials"
      class="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-5 rounded-xl"
    >
      {#each prioritizedMaterials as helpMaterial}
        <button
          class="material-card bg-base-100 border border-base-200 rounded-lg overflow-hidden transition-all duration-150 cursor-pointer hover:scale-[1.015]"
          on:click={onOpenMaterial(helpMaterial)}
          on:contextmenu={(e) => openMaterialMenu(e, helpMaterial)}
        >
          <div class="relative">
            <img
              src={helpMaterial.imgURL}
              alt={helpMaterial.title}
              class="w-full h-48 object-cover"
            />
            {#if activeGroupId !== "all" && activeGroupId !== "recent" && helpMaterial.category === activeGroupId}
              <span
                class="absolute top-3 left-3 bg-primary text-primary-content text-xs px-2 py-1 rounded"
                >{getGroupTitle(activeGroupId)}</span
              >
            {:else if activeGroupId === "recent" && helpMaterial.publicationDate.getTime() >= recentCutoff.getTime()}
              <span
                class="absolute top-3 left-3 bg-primary text-primary-content text-xs px-2 py-1 rounded"
                >{getGroupTitle(activeGroupId)}</span
              >
            {:else if activeGroupId === "all" && helpMaterial.publicationDate.getTime() >= recentCutoff.getTime()}
              <span
                class="absolute top-3 left-3 bg-primary text-primary-content text-xs px-2 py-1 rounded"
                >Recent</span
              >
            {/if}
          </div>

          <div class="textual w-full text-start p-4 pb-8">
            <h4 class="font-semibold">{helpMaterial.title}</h4>
            <p class="text-thin text-base-content/60 text-sm">
              {helpMaterial.description}
            </p>
          </div>
        </button>
      {/each}
    </div>
  </div>
</UI.Common.PageWrapper>
