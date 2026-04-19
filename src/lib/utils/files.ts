import type { File } from "$lib/sharedCompat";

export function fileMap(value: File.File.File): File.File.File[] {
    return [
        value,
        ...(value.subentries ? value.subentries.flatMap(fileMap) : [])
    ]
}