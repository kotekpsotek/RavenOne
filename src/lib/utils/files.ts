import { File } from "@ravenlens/shared";

export function fileMap(value: File.File.File): File.File.File[] {
    return [
        value,
        ...(value.subentries ? value.subentries.flatMap(fileMap) : [])
    ]
}