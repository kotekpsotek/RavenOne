import { json, type RequestHandler } from "@sveltejs/kit";
import { Workspace } from "@ravenlens/shared";
import { GITHUB_ACCESS_TOKEN, LINKEDIN_ACCESS_TOKEN } from "$env/static/private";

/**
 * Use this api endpoint to download the list of workspace members
 * Result has to be a array has to be a type `Workspace.Workspace.WorkspaceMemberInvitement["user"]` with a parameters: [
 *  { email: "", id: "", name: "", profileImg: "" }
 * ]
*/
export const POST: RequestHandler = async ({ request }) => {
    const { userName, method } = await request.json() as {
        userName: string;
        method: Workspace.Workspace.InvitementKind;
    };

    if (!userName || userName.trim() === "") {
        return json([]);
    }

    const trimmedUserName = userName.trim();

    switch(method) {
        case "github": {
            try {
                const response = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(trimmedUserName)}`, {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        ...(GITHUB_ACCESS_TOKEN ? { "Authorization": `Bearer ${GITHUB_ACCESS_TOKEN}` } : {})
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    return json({ error: error.message || "GitHub API error" }, { status: response.status });
                }

                const data = await response.json();
                const users = data.items.map((item: any) => ({
                    id: String(item.id),
                    name: item.login,
                    email: "", // Primary email is not public
                    profileImg: item.avatar_url
                }));

                return json(users);
            } catch (err) {
                return json({ error: "Failed to fetch from GitHub" }, { status: 500 });
            }
        }

        case "linkedin": {
            if (!LINKEDIN_ACCESS_TOKEN) {
                return json({ error: "LinkedIn API is not configured. Please add LINKEDIN_ACCESS_TOKEN to your environment." }, { status: 501 });
            }

            try {
                // Using the LinkedIn People Search API (requires appropriate partnership permissions)
                const response = await fetch(`https://api.linkedin.com/v2/people-search?q=people&keywords=${encodeURIComponent(trimmedUserName)}`, {
                    headers: {
                        "Authorization": `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
                        "X-Restli-Protocol-Version": "2.0.0"
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    return json({ error: error.message || "LinkedIn API error" }, { status: response.status });
                }

                const data = await response.json();
                
                // Map LinkedIn people to the required format
                const users = (data.elements || []).map((person: any) => {
                    const firstName = person.firstName?.localized ? Object.values(person.firstName.localized)[0] : (person.firstName?.preferredLocale?.language || "");
                    const lastName = person.lastName?.localized ? Object.values(person.lastName.localized)[0] : (person.lastName?.preferredLocale?.language || "");
                    const name = `${firstName} ${lastName}`.trim() || "LinkedIn User";
                    
                    // Profile images in LinkedIn API are nested and require projections or specific URN lookups
                    const profileImg = person.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier || 
                                     `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0077B5&color=fff`;

                    return {
                        id: person.id,
                        name: name,
                        email: "", // Not available via search API
                        profileImg: profileImg
                    };
                });

                return json(users);
            } catch (err) {
                return json({ error: "Failed to fetch from LinkedIn" }, { status: 500 });
            }
        }

        default:
            return json([]);
    }
}
