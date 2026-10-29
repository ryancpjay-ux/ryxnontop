"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Star,
  Archive,
  Folder,
  Plus,
  Search,
  Grid2X2,
  List,
  FileText,
  ArrowLeft,
  Download,
  Share2,
  Trash2,
  Sparkles,
  Tag,
  Mic,
  PenLine,
  Layers,
  X,
} from "lucide-react";
import SafeMarkdown from "@/components/SafeMarkdown";
import {
  downloadText,
  filterNotes,
  noteKind,
  noteMarkdown,
  type NoteFilter,
  type NoteRecord,
} from "@/lib/local-library";
import { SelectMenu } from "./SelectMenu";

type Props = {
  notes: NoteRecord[];
  onChange: Dispatch<SetStateAction<NoteRecord[]>>;
  folders: string[];
  onFolders: (folders: string[]) => void;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  initialFilter?: NoteFilter;
  onAI: (task: string) => Promise<string | null>;
  aiBusy: boolean;
  offline: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};
export function NotesLibrary(props: Props) {
  const {
    notes,
    onChange,
    folders,
    onFolders,
    activeId,
    onSelect,
    onCreate,
    initialFilter = "all",
    onAI,
    aiBusy,
    offline,
    onNotice,
    onError,
  } = props;
  const [filter, setFilter] = useState<NoteFilter>(initialFilter);
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Newest");
  const [grid, setGrid] = useState(true);
  const [folderName, setFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [aiInstruction, setAIInstruction] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tagText, setTagText] = useState("");
  const printRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    setFilter(initialFilter);
    setFolder("");
    setTag("");
  }, [initialFilter]);
  useEffect(() => {
    setDeleting(false);
    setTagText(
      notesRef.current.find((item) => item.id === activeId)?.tags?.join(", ") ??
        "",
    );
  }, [activeId]);
  const note = notes.find((item) => item.id === activeId);
  const visible = filterNotes(notes, { query, filter, folder, tag, sort });
  const tags = [...new Set(notes.flatMap((item) => item.tags ?? []))].sort();
  const allFolders = [
    ...new Set([
      ...folders,
      ...notes.map((item) => item.folder ?? "").filter(Boolean),
    ]),
  ].sort();
  const patch = (value: Partial<NoteRecord>) => {
    if (note)
      onChange((current) =>
        current.map((item) =>
          item.id === note.id ? { ...item, ...value } : item,
        ),
      );
  };
  const chooseFilter = (value: NoteFilter) => {
    setFilter(value);
    setFolder("");
    setTag("");
    onSelect(null);
  };
  const title =
    folder ||
    (tag
      ? `#${tag}`
      : {
          all: "All notes",
          automatic: "Automatic notes",
          manual: "Manual notes",
          favorites: "Favorites",
          archived: "Archived",
        }[filter]);
  async function pdf() {
    if (!note) return;
    if (!window.localCopilot?.exportPDF) {
      onError("PDF export is available in the desktop app.");
      return;
    }
    try {
      if (
        await window.localCopilot.exportPDF({
          title: note.title,
          html: printRef.current?.innerHTML ?? "",
        })
      )
        onNotice("PDF exported");
    } catch {
      onError("Could not export the PDF. Please try again.");
    }
  }
  async function share() {
    if (!note) return;
    try {
      if (window.localCopilot?.shareNote) {
        await window.localCopilot.shareNote(noteMarkdown(note));
        onNotice("Choose a destination in the sharing menu");
      } else {
        await navigator.clipboard.writeText(noteMarkdown(note));
        onNotice("Note copied for sharing");
      }
    } catch {
      onError("Could not open sharing. Export Markdown to share the note.");
    }
  }
  return (
    <div className="ryx-library">
      <aside className="ryx-library-sidebar" aria-label="Notes navigation">
        <button
          className={
            filter === "automatic" && !folder && !tag ? "selected" : ""
          }
          onClick={() => chooseFilter("automatic")}
        >
          <Mic size={14} />
          Automatic
        </button>
        <button
          className={filter === "manual" && !folder && !tag ? "selected" : ""}
          onClick={() => chooseFilter("manual")}
        >
          <PenLine size={14} />
          Manual
        </button>
        <hr />
        <button
          className={filter === "all" && !folder && !tag ? "selected" : ""}
          onClick={() => chooseFilter("all")}
        >
          <Layers size={14} />
          All notes
        </button>
        <button
          className={filter === "favorites" ? "selected" : ""}
          onClick={() => chooseFilter("favorites")}
        >
          <Star size={14} />
          Favorites
        </button>
        <button
          className={filter === "archived" ? "selected" : ""}
          onClick={() => chooseFilter("archived")}
        >
          <Archive size={14} />
          Archived
        </button>
        <hr />
        <div className="ryx-nav-title">
          Folders
          <button
            aria-label="Create folder"
            onClick={() => setAddingFolder((value) => !value)}
          >
            <Plus size={13} />
          </button>
        </div>
        {addingFolder && (
          <form
            className="ryx-folder-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = folderName.trim();
              if (!name) return;
              onFolders([...new Set([...allFolders, name])]);
              setFolderName("");
              setAddingFolder(false);
              setFolder(name);
              setFilter("all");
              setTag("");
              onSelect(null);
            }}
          >
            <input
              aria-label="Folder name"
              placeholder="Folder name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              maxLength={60}
            />
            <button aria-label="Save folder">
              <Plus size={14} />
            </button>
          </form>
        )}
        {allFolders.map((name) => (
          <button
            key={name}
            className={folder === name ? "selected" : ""}
            onClick={() => {
              setFolder(name);
              setFilter("all");
              setTag("");
              onSelect(null);
            }}
          >
            <Folder size={13} />
            {name}
          </button>
        ))}
        <hr />
        <div className="ryx-nav-title">Tags</div>
        {tags.length ? (
          tags.map((name) => (
            <button
              key={name}
              className={tag === name ? "selected" : ""}
              onClick={() => {
                setTag(name);
                setFilter("all");
                setFolder("");
                onSelect(null);
              }}
            >
              <Tag size={12} />
              {name}
            </button>
          ))
        ) : (
          <p>No tags yet</p>
        )}
      </aside>
      <div className="ryx-library-main">
        {note ? (
          <>
            <div className="ryx-library-heading">
              <button className="ryx-back" onClick={() => onSelect(null)}>
                <ArrowLeft size={14} />
                Library
              </button>
              <div className="ryx-note-toolbar">
                <button
                  aria-label={
                    note.favorite ? "Remove favorite" : "Favorite note"
                  }
                  aria-pressed={Boolean(note.favorite)}
                  onClick={() => patch({ favorite: !note.favorite })}
                >
                  <Star
                    size={16}
                    fill={note.favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  aria-label={note.archived ? "Unarchive note" : "Archive note"}
                  onClick={() => {
                    patch({ archived: !note.archived });
                    onNotice(
                      note.archived
                        ? "Note restored from archive"
                        : "Note archived",
                    );
                  }}
                >
                  <Archive size={16} />
                </button>
                <button
                  aria-label="Export Markdown"
                  title="Export Markdown"
                  onClick={() =>
                    downloadText(
                      `${note.title.replace(/[^\w -]/g, "") || "note"}.md`,
                      noteMarkdown(note),
                    )
                  }
                >
                  <Download size={16} />
                  <span>MD</span>
                </button>
                <button
                  aria-label="Export PDF"
                  title="Export PDF"
                  onClick={() => void pdf()}
                >
                  <FileText size={16} />
                  <span>PDF</span>
                </button>
                <button
                  aria-label="Share note"
                  title="Share note"
                  onClick={() => void share()}
                >
                  <Share2 size={16} />
                </button>
                <button
                  aria-label="Delete note"
                  onClick={() => setDeleting((value) => !value)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {deleting && (
              <div className="ryx-delete-confirm">
                <span>Delete this note?</span>
                <button
                  onClick={() => {
                    onChange((current) =>
                      current.filter((item) => item.id !== note.id),
                    );
                    onSelect(null);
                    onNotice("Note deleted");
                  }}
                >
                  Delete
                </button>
                <button onClick={() => setDeleting(false)}>Cancel</button>
              </div>
            )}
            <input
              className="ryx-note-title"
              aria-label="Note title"
              value={note.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
            <div className="ryx-note-meta">
              <span>
                {noteKind(note) === "automatic" ? "Automatic" : "Manual"} ·{" "}
                {new Date(note.date).toLocaleDateString()}
              </span>
              <label>
                Folder
                <SelectMenu
                  label="Note folder"
                  value={note.folder || "No folder"}
                  options={["No folder", ...allFolders]}
                  placement="down"
                  onChange={(value) =>
                    patch({ folder: value === "No folder" ? "" : value })
                  }
                />
              </label>
            </div>
            {note.audioFiles?.map((filename) => (
              <button
                key={filename}
                className="mist-soft-button"
                onClick={() =>
                  void window.localCopilot
                    ?.openAudio(filename)
                    .catch(() => onError("Could not open recording."))
                }
              >
                <Mic size={13} />
                Open local recording
              </button>
            ))}
            <input
              className="ryx-tags-input"
              aria-label="Note tags"
              placeholder="Tags, separated by commas"
              value={tagText}
              onChange={(event) => {
                setTagText(event.target.value);
                patch({
                  tags: [
                    ...new Set(
                      event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    ),
                  ],
                });
              }}
            />
            <textarea
              className="ryx-note-content"
              aria-label="Note content"
              placeholder="Write your note…"
              value={note.content}
              onChange={(event) => patch({ content: event.target.value })}
            />
            <form
              className="ryx-ai-edit"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!aiInstruction.trim()) return;
                const original = note.content;
                const result = await onAI(
                  `Rewrite the note below according to the instruction. Return only the revised note in Markdown, keeping facts accurate.\nINSTRUCTION: ${aiInstruction}\nNOTE:\n${original}`,
                );
                if (result) {
                  onChange((previous) =>
                    previous.map((current) =>
                      current.id === note.id
                        ? {
                            ...current,
                            content:
                              current.content === original
                                ? result
                                : `${current.content}\n\n## AI revision\n\n${result}`,
                          }
                        : current,
                    ),
                  );
                  setAIInstruction("");
                  onNotice("Note updated with AI");
                }
              }}
            >
              <Sparkles size={15} />
              <input
                aria-label="AI editing instruction"
                placeholder={
                  offline
                    ? "Connect to use AI editing"
                    : "Ask AI to improve this note…"
                }
                value={aiInstruction}
                onChange={(event) => setAIInstruction(event.target.value)}
                disabled={offline || aiBusy}
              />
              <button disabled={offline || aiBusy || !aiInstruction.trim()}>
                {aiBusy ? "Working…" : "Apply"}
              </button>
            </form>
            <div className="ryx-print-preview" ref={printRef}>
              <SafeMarkdown>{note.content}</SafeMarkdown>
            </div>
          </>
        ) : (
          <>
            <div className="ryx-library-heading">
              <div>
                <h2>{title}</h2>
                <p>
                  {visible.length} {visible.length === 1 ? "note" : "notes"}
                </p>
              </div>
              <button className="mist-soft-button" onClick={onCreate}>
                <Plus size={14} />
                New note
              </button>
            </div>
            <div className="ryx-library-tools">
              <label className="mist-search">
                <Search size={14} />
                <input
                  aria-label="Search notes"
                  placeholder="Search notes…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <SelectMenu
                label="Sort notes"
                value={sort}
                options={["Newest", "Oldest", "Title"]}
                onChange={setSort}
                placement="down"
              />
              <button
                aria-label="Grid view"
                aria-pressed={grid}
                onClick={() => setGrid(true)}
              >
                <Grid2X2 size={15} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={!grid}
                onClick={() => setGrid(false)}
              >
                <List size={15} />
              </button>
            </div>
            {(folder || tag) && (
              <button
                className="ryx-clear-filter"
                onClick={() => {
                  setFolder("");
                  setTag("");
                }}
              >
                Clear filter <X size={12} />
              </button>
            )}
            <div className={`ryx-note-cards ${grid ? "grid" : "list"}`}>
              {visible.map((item) => (
                <button
                  className="ryx-note-card"
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <FileText size={24} />
                  <strong>
                    {item.title || "Untitled note"}
                    {item.favorite && <Star size={12} fill="currentColor" />}
                  </strong>
                  <span>{new Date(item.date).toLocaleDateString()}</span>
                  <p>{item.content.replace(/[#*`]/g, "").slice(0, 95)}</p>
                </button>
              ))}
            </div>
            {!visible.length && (
              <div className="mist-empty">
                <FileText size={25} />
                <h2>
                  {query
                    ? "No matching notes"
                    : "A little room for your thoughts."}
                </h2>
                <p>
                  {filter === "automatic"
                    ? "Listen sessions are saved here automatically."
                    : "Create a note, save an answer, or choose another filter."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
