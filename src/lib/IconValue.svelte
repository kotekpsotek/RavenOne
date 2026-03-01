<script lang="ts">
    import Icon from "@iconify/svelte";

    type Props = {
        iconValue?: string;
        fallbackIcon?: string;
        iconClass?: string;
        emojiClass?: string;
        imageClass?: string;
        alt?: string;
    };

    let {
        iconValue = "",
        fallbackIcon = "material-symbols:description-outline-rounded",
        iconClass = "text-xl",
        emojiClass = "text-xl leading-none",
        imageClass = "h-6 w-6",
        alt = "Selected icon"
    }: Props = $props();

    let normalizedValue = $derived(iconValue.trim());
    let isSvgDataUri = $derived(normalizedValue.startsWith("data:image/svg+xml"));
    let isIconifyName = $derived(normalizedValue.includes(":"));
</script>

{#if !normalizedValue}
    <Icon icon={fallbackIcon} class={iconClass} />
{:else if isSvgDataUri}
    <img src={normalizedValue} alt={alt} class={imageClass} draggable="false" />
{:else if isIconifyName}
    <Icon icon={normalizedValue} class={iconClass} />
{:else}
    <span class={emojiClass} aria-label={alt}>{normalizedValue}</span>
{/if}