import { createEditor } from "svelte-tiptap";
import { StarterKit } from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Youtube from '@tiptap/extension-youtube'

const configurationSteps: string[] = [
    "Download and setup on your publicly available machine RavenOne MCP Middleware Server. Download server from Github or Docker.",
    "Establish Secret Password on side of MCP Middleware Server",
    `Specify your server publicly available link at input url field in 'RavenOne > AI Models Settings'`,
    `Specify at 'RavenOne > AI Models Settings' same password as you've specified for RavenOne MCP Server Middleware`,
    `Specify the whitelist of available MCP servers with its configuration and required credentials in modal open with usage of 'Configure MCP Servers' button. Then click on "Save" button to save changes`,
    `Accept all setup by flick on "Accept" button below all so far specified fields`,
    `Verify connection state with specified RavenOne MCP Middleware Server by look on "MCP RavenOne Server-Middleware URL" input right-side status-box`
];

/**
 * TODO:
 * 1. Make the Video Script
 * 2. Record the screen video with my face and voice
 */
export const youtubeURL = "https://www.youtube.com/channel/UCobx37n-p7yh39dtg0u7-Hw";
export const setupGuideEditorConfig = {
        content: `
            <div data-youtube-video>
                <iframe src="${youtubeURL}"></iframe>
            </div>
            <ol>
                <li>
                    Download MCP Server from <a href="https://github.com/kotekpsotek/RavenOne-MCP-Middleware-Server">Github</a> with <code>git clone https://github.com/kotekpsotek/RavenOne-MCP-Middleware-Server.git</code>
                </li>

                <li>
                    Establish <b>Secret Password</b> in <code>.env</code> file of cloned MCP Server
                </li>
                
                <li>
                    Host your server on side of some provider or on your publicly available machine/VM
                </li>
                
                <li>
                    Specify your server publicly available link at input url field in <code>RavenOne &gt; AI Models Settings</code> and <code>Accept</code>
                </li>

                <li>
                    Configure the list of available MCP Server with <code>Configure MCP Servers</code> button or by editting json configuration file on your locally hosted server
                </li>
            </ol>
        `,
        editable: false,
        extensions: [
            StarterKit,
            Link.configure({
                openOnClick: false,
                autolink: false,
                linkOnPaste: false,
            }),
                Youtube.configure({
                        controls: false,
                        nocookie: true,
                })
        ]
}

export function createSetupGuideEditor() {
        return createEditor(setupGuideEditorConfig)
}
