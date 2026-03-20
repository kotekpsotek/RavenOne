import { redirect } from "@sveltejs/kit";

export let load = () => {
    throw redirect(307, "/help-materials");
}
