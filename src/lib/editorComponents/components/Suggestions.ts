import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { mount, unmount } from "svelte";
import tippy from "tippy.js";
import Suggestions from "../ui/Suggestions.svelte";
import { menuElements } from "../ui/ElementsListForMenus.js";
import {
  activedIdx,
  clearSuggestionState,
  onKeyDown,
  popup,
  setSuggestionState
} from "../ui/SuggestionsHandlers.js";

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        items: ({ query }: { query: string }) => {
          const normalizedQuery = query.toLowerCase();
          return menuElements.filter((item) => {
            const matchedName = item.name.toLowerCase().includes(normalizedQuery);
            const matchedAlias = item.aliases?.some((alias) => alias.toLowerCase().includes(normalizedQuery));
            return matchedName || matchedAlias;
          });
        },
        command: ({ editor, range, props }: any) => {
          props.command(editor, range);
        },
        render: () => {
          let wrapper: HTMLDivElement | null = null;
          let component: ReturnType<typeof mount> | null = null;

          return {
            onStart: (props: any) => {
              const textSp = props.editor.getText().split("\n")[0].length;
              const cannotRenderInFirstLine = props.editor.state.selection.anchor <= textSp + 1;

              if (cannotRenderInFirstLine) {
                return;
              }

              wrapper = document.createElement("div");
              props.editor.view.dom.parentNode?.appendChild(wrapper);

              setSuggestionState(props.items, props.editor, props.range);
              component = mount(Suggestions, { target: wrapper });

              popup.set(
                tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: wrapper,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start"
                })
              );
            },

            onUpdate: (props: any) => {
              setSuggestionState(props.items, props.editor, props.range);

              popup.update((activePopup) => {
                if (!activePopup?.[0]) {
                  return activePopup;
                }

                activePopup[0].setProps({
                  getReferenceClientRect: props.clientRect
                });

                return activePopup;
              });
            },

            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                popup.update((activePopup) => {
                  if (!activePopup?.[0]) {
                    return activePopup;
                  }

                  activePopup[0].hide();
                  return activePopup;
                });
                return true;
              }

              return onKeyDown(props.event);
            },

            onExit: () => {
              activedIdx.set(0);
              clearSuggestionState();

              popup.update((activePopup) => {
                if (activePopup?.[0]) {
                  activePopup[0].destroy();
                }
                return null;
              });

              if (component) {
                unmount(component);
              }
              wrapper?.remove();
              component = null;
              wrapper = null;
            }
          };
        }
      }
    };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion } as any)];
  }
});