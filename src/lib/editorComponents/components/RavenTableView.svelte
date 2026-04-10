<script module lang="ts">
    import { TableView } from "@tiptap/extension-table";
    import { deleteRow, deleteTable } from "@tiptap/pm/tables";
    import { TextSelection } from "@tiptap/pm/state";
    import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
    import type { EditorView } from "@tiptap/pm/view";
    import { setConfirmationAlert } from "$lib/utils/alert";

    export class RavenTableView extends TableView {
        private readonly editorView: EditorView;
        private readonly addRowContainer: HTMLDivElement;
        private readonly addRowButton: HTMLButtonElement;
        private readonly removeTableRowButton: HTMLButtonElement;
        private readonly removeTableButton: HTMLButtonElement;
        private tableResizeObserver: ResizeObserver | undefined;
        private selectionListener: (() => void) | undefined;

        constructor(node: ProseMirrorNode, cellMinWidth: number, view: EditorView) {
            super(node, cellMinWidth);
            this.editorView = view;

            this.addRowContainer = document.createElement("div");
            this.addRowContainer.className = "tiptap-table-add-row";

            this.addRowButton = document.createElement("button");
            this.addRowButton.type = "button";
            this.addRowButton.className = "tiptap-table-add-row-button";
            this.addRowButton.setAttribute("aria-label", "Add row to table");
            this.addRowButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M11.288 20.713Q11 20.425 11 20v-7H4q-.425 0-.712-.288T3 12t.288-.712T4 11h7V4q0-.425.288-.712T12 3t.713.288T13 4v7h7q.425 0 .713.288T21 12t-.288.713T20 13h-7v7q0 .425-.288.713T12 21t-.712-.288" stroke-width="0.5" stroke="currentColor" />
                </svg>
                <span>Add Row</span>
            `;

            this.removeTableRowButton = document.createElement("button");
            this.removeTableRowButton.type = "button";
            this.removeTableRowButton.className = "tiptap-table-remove-row-button";
            this.removeTableRowButton.setAttribute("aria-label", "Remove row from table");
            this.removeTableRowButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M5 11h14v2H5z" />
                </svg>
                <span>Remove Row</span>
            `;

            this.removeTableButton = document.createElement("button");
            this.removeTableButton.type = "button";
            this.removeTableButton.className = "tiptap-table-remove-table-button";
            this.removeTableButton.setAttribute("aria-label", "Remove table");
            this.removeTableButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7 6h10v2H7zm0 5h10v2H7zm0 5h10v2H7z" />
                </svg>
                <span>Remove Table</span>
            `;

            this.addRowButton.addEventListener("mousedown", this.handleButtonMouseDown);
            this.addRowButton.addEventListener("click", this.handleButtonClick);
            this.removeTableRowButton.addEventListener("mousedown", this.handleButtonMouseDown);
            this.removeTableRowButton.addEventListener("click", this.handleRemoveTableRowButtonClick);
            this.removeTableButton.addEventListener("mousedown", this.handleButtonMouseDown);
            this.removeTableButton.addEventListener("click", this.handleRemoveTableButtonClick);

            this.addRowContainer.appendChild(this.addRowButton);
            this.addRowContainer.appendChild(this.removeTableRowButton);
            this.addRowContainer.appendChild(this.removeTableButton);
            this.dom.appendChild(this.addRowContainer);

            if (typeof ResizeObserver !== "undefined") {
                this.tableResizeObserver = new ResizeObserver(() => {
                    this.syncAddRowWidth();
                });
                this.tableResizeObserver.observe(this.table);
            }

            this.syncAddRowWidth();
            this.syncTableActionState();

            this.selectionListener = () => {
                this.syncTableActionState();
            };

            this.editorView.dom.ownerDocument?.addEventListener("selectionchange", this.selectionListener);
        }

        update(node: ProseMirrorNode): boolean {
            const updated = super.update(node);
            if (updated) {
                this.syncAddRowWidth();
            }

            return updated;
        }

        destroy() {
            this.tableResizeObserver?.disconnect();
            if (this.selectionListener) {
                this.editorView.dom.ownerDocument?.removeEventListener("selectionchange", this.selectionListener);
                this.selectionListener = undefined;
            }
            this.addRowButton.removeEventListener("mousedown", this.handleButtonMouseDown);
            this.addRowButton.removeEventListener("click", this.handleButtonClick);
            this.removeTableRowButton.removeEventListener("mousedown", this.handleButtonMouseDown);
            this.removeTableRowButton.removeEventListener("click", this.handleRemoveTableRowButtonClick);
            this.removeTableButton.removeEventListener("mousedown", this.handleButtonMouseDown);
            this.removeTableButton.removeEventListener("click", this.handleRemoveTableButtonClick);
        }

        private readonly handleButtonMouseDown = (event: MouseEvent) => {
            // Keep editor focus/selection stable before executing row insertion.
            event.preventDefault();
        };

        private readonly handleButtonClick = (event: MouseEvent) => {
            event.preventDefault();
            this.appendRowToTableEnd();
        };

        private readonly handleRemoveTableRowButtonClick = (event: MouseEvent) => {
            event.preventDefault();

            if (!this.canDeleteCurrentTablePart()) {
                return;
            }

            setConfirmationAlert({
                name: "Remove table row?",
                description: "This will delete the current row from the table.",
                confirmLabel: "Remove Row",
                onConfirm: () => this.deleteCurrentTableRow()
            });
        };

        private readonly handleRemoveTableButtonClick = (event: MouseEvent) => {
            event.preventDefault();

            if (!this.canDeleteCurrentTablePart()) {
                return;
            }

            setConfirmationAlert({
                name: "Remove table?",
                description: "This will delete the entire table.",
                confirmLabel: "Remove Table",
                onConfirm: () => this.deleteCurrentTable()
            });
        };

        private syncAddRowWidth() {
            const tableWidth = Math.max(this.table.getBoundingClientRect().width, 64);
            this.addRowContainer.style.width = `${tableWidth}px`;
        }

        private syncTableActionState() {
            const canDelete = this.canDeleteCurrentTablePart();

            this.removeTableRowButton.disabled = !canDelete;
            this.removeTableButton.disabled = !canDelete;

            this.removeTableRowButton.title = canDelete
                ? "Remove the current row from this table"
                : "Place the cursor inside a row in this table to remove that row";
            this.removeTableButton.title = canDelete
                ? "Remove this table"
                : "Place the cursor inside a row in this table to remove the table";
        }

        private canDeleteCurrentTablePart(): boolean {
            if (!this.editorView.editable) {
                return false;
            }

            const currentTablePos = this.getTablePos();
            const selectionTablePos = this.getSelectionTablePos(this.editorView.state.selection.$from);

            return currentTablePos !== null && selectionTablePos === currentTablePos;
        }

        private getSelectionTablePos(resolvedPos: ResolvedPos): number | null {
            for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
                if (resolvedPos.node(depth).type.name === "table") {
                    return resolvedPos.before(depth);
                }
            }

            return null;
        }

        private getTablePos(): number | null {
            try {
                // contentDOM points to tbody start, so table position is one step before content.
                return this.editorView.posAtDOM(this.contentDOM, 0) - 1;
            }
            catch {
                return null;
            }
        }

        private appendRowToTableEnd() {
            if (!this.editorView.editable) {
                return;
            }

            const tablePos = this.getTablePos();
            const rowType = this.editorView.state.schema.nodes.tableRow;
            const fallbackCellType = this.editorView.state.schema.nodes.tableCell;
            const lastRow = this.node.lastChild;

            if (tablePos === null || !rowType || !lastRow) {
                return;
            }

            const rowCells: ProseMirrorNode[] = [];
            for (let i = 0; i < lastRow.childCount; i += 1) {
                const sourceCell = lastRow.child(i);
                const targetCellType = sourceCell.type.name === "tableHeader" && fallbackCellType
                    ? fallbackCellType
                    : sourceCell.type;
                const emptyCell = targetCellType.createAndFill();
                if (emptyCell) {
                    rowCells.push(emptyCell);
                }
            }

            if (!rowCells.length) {
                return;
            }

            const newRow = rowType.createAndFill(undefined, rowCells);
            if (!newRow) {
                return;
            }

            const insertPos = tablePos + this.node.nodeSize - 1;
            let tr = this.editorView.state.tr.insert(insertPos, newRow);

            const selectionPos = Math.min(insertPos + 1, tr.doc.content.size);
            tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos))).scrollIntoView();

            this.editorView.dispatch(tr);
            this.editorView.focus();
        }

        private deleteCurrentTableRow() {
            if (!this.editorView.editable) {
                return;
            }

            this.editorView.focus();
            deleteRow(this.editorView.state, this.editorView.dispatch.bind(this.editorView));
        }

        private deleteCurrentTable() {
            if (!this.editorView.editable) {
                return;
            }

            this.editorView.focus();
            deleteTable(this.editorView.state, this.editorView.dispatch.bind(this.editorView));
        }
    }
</script>

<style lang="postcss">
    @reference "../../../app.css";

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper) {
        @apply my-4 overflow-x-auto flex flex-col gap-2;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) table.raven-table),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper > table) {
        @apply overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm;
        border-collapse: separate;
        border-spacing: 0;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table td) {
        @apply min-w-24 border-r border-b border-base-300 bg-base-100 px-3 py-2 align-top text-base-content;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th) {
        @apply bg-base-200 font-semibold;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table tr > :last-child) {
        @apply border-r-0;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table tbody tr:last-child > td),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table tbody tr:last-child > th) {
        @apply border-b-0;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table .selectedCell) {
        @apply bg-primary/15 ring-1 ring-inset ring-primary/60;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper .column-resize-handle) {
        @apply w-0.5 bg-primary/70;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row) {
        @apply mt-1.5 flex flex-wrap gap-2;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button) {
        @apply flex gap-1 p-1 text-xs font-semibold w-fit cursor-pointer items-center justify-center rounded-md border border-base-300 bg-base-200 text-base text-base-content/85 transition-colors duration-150;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button) {
        @apply flex gap-1 p-1 text-xs font-semibold w-fit cursor-pointer items-center justify-center rounded-md border border-error/35 text-error transition-colors duration-150;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:disabled),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:disabled) {
        @apply cursor-not-allowed opacity-50;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button) {
        @apply bg-error/10 text-rose-500 border-rose-500;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:hover) {
        @apply border-primary/70 bg-base-300 text-base-content text-primary/70;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:hover),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:hover) {
        @apply border-error/60 bg-error/15 text-error;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:focus-visible) {
        @apply outline-none ring-2 ring-primary/45 ring-offset-1 ring-offset-base-100;
    }

    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:focus-visible),
    :global(.tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:focus-visible) {
        @apply outline-none ring-2 ring-error/45 ring-offset-1 ring-offset-base-100;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) table.raven-table),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) table.raven-table),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) table.raven-table),
    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper > table),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper > table),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper > table) {
        @apply border-base-content/20 bg-base-300/30;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table td),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table td),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table td) {
        @apply border-base-content/20 bg-base-300/55;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tableWrapper table th) {
        @apply bg-base-300/85;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button) {
        @apply border-base-content/25 bg-base-300/80 text-base-content;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button),
    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button) {
        @apply border-error/45 bg-error/15 text-error-content;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:hover),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:hover),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:hover) {
        @apply border-primary/70 bg-base-300;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:hover),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:hover),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:hover),
    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:hover),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:hover),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:hover) {
        @apply border-error/70 bg-error/20;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:focus-visible),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:focus-visible),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-add-row-button:focus-visible) {
        @apply ring-offset-base-300;
    }

    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:focus-visible),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:focus-visible),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-row-button:focus-visible),
    :global([data-theme="dark"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:focus-visible),
    :global([data-theme="black"] .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:focus-visible),
    :global(.dark .tiptap-editor :is(.tiptap, .ProseMirror) .tiptap-table-remove-table-button:focus-visible) {
        @apply ring-offset-base-300;
    }
</style>