import type { ServerLoad } from '@sveltejs/kit';
import type { HelpMaterialWithContent } from "@ravenlens/shared"

export const load: ServerLoad = ({ params }) => {
    if (params.id === "test") {
        return {
            material: {
            id: "test",
            title: "Highlights and takeaways from RavenLens Help",
            description: "",
            imgURL: "https://picsum.photos/id/1039/1200/650",
            category: "Help",
            publicationDate: new Date("2025-12-18"),
            content: `
                <p>This is a demo article body. Once the backend load is wired, this view will render the real material content.</p>
                <p>Use the left share rail on desktop, or the share buttons in the header on mobile.</p>
                <p>Images are displayed in a rounded card container as shown in the reference screenshot.</p>
            `.trim()
        } as HelpMaterialWithContent
        }
    }
    else {
        // TODO: Load real data
        return {
            material: undefined
        }
    }
};
