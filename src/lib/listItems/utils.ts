import { v4 as uuid } from "uuid";

export function createListItemId() {
    return `list-point:${uuid()}`;    
}
