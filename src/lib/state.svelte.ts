import { v4 as uuidv4 } from 'uuid';

export type DocType = 'document' | 'oneroutine' | 'result';

    export interface Document {
        id: string;
        title: string;
        type: DocType;
        children: Document[];
        content: any; // Tiptap JSON
        expanded?: boolean;
        icon?: string;
    }

    let documents = $state<Document[]>([
        {
            id: '1',
            title: 'Welcome Document',
            type: 'document',
            content: {},
            children: [],
            expanded: true
        },
        {
            id: '2',
            title: 'Daily Standup',
            type: 'oneroutine',
            content: {},
            children: [
                {
                    id: '3',
                    title: 'Standup result - 10/02/2026',
                    type: 'result',
                    content: {},
                    children: []
                }
            ],
            expanded: true
        }
    ]);

    let activeDocumentId = $state<string | null>('1');
    let filter = $state<'all' | 'document' | 'oneroutine'>('all');
    
    // Signal to trigger play action in editor
    export const playSignal = { value: 0 };

    export function triggerPlay() {
        playSignal.value++;
    }

    export function getDocuments() {
        return documents;
    }

    export function getFilteredDocuments() {
        if (filter === 'all') return documents;
        return documents.filter(d => d.type === filter);
    }

    export function getActiveDocument() {
        if (!activeDocumentId) return null;
        
        function find(docs: Document[]): Document | null {
            for (const doc of docs) {
                if (doc.id === activeDocumentId) return doc;
                const found = find(doc.children);
                if (found) return found;
            }
            return null;
        }
        return find(documents);
    }

    export function setActiveDocument(id: string) {
        activeDocumentId = id;
    }

    export function addDocument(parentId: string | null = null, type: DocType = 'document') {
        const newDoc: Document = {
            id: uuidv4(),
            title: type === 'document' ? 'Untitled Document' : 'New Routine',
            type,
            children: [],
            content: {},
            expanded: true
        };

        if (!parentId) {
            documents.push(newDoc);
        } else {
             function addToParent(docs: Document[]) {
                for (const doc of docs) {
                    if (doc.id === parentId) {
                        doc.children.push(newDoc);
                        doc.expanded = true;
                        return true;
                    }
                    if (addToParent(doc.children)) return true;
                }
                return false;
            }
            addToParent(documents);
        }
        setActiveDocument(newDoc.id);
    }

    export function setFilter(f: 'all' | 'document' | 'oneroutine') {
        filter = f;
    }

    export function getFilter() {
        return filter;
    }

    export function toggleExpand(id: string) {
        function toggle(docs: Document[]) {
            for (const doc of docs) {
                if (doc.id === id) {
                    doc.expanded = !doc.expanded;
                    return true;
                }
                if (toggle(doc.children)) return true;
            }
            return false;
        }
        toggle(documents);
    }
