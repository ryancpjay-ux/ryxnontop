export type NoteRecord = {
  id: string;
  title: string;
  content: string;
  date: string;
  kind?: "automatic" | "manual";
  favorite?: boolean;
  archived?: boolean;
  folder?: string;
  tags?: string[];
  audioFiles?: string[];
};
export type NoteFilter =
  | "all"
  | "automatic"
  | "manual"
  | "favorites"
  | "archived";
export function noteKind(note: NoteRecord): "automatic" | "manual" {
  return (
    note.kind ??
    (/^(Listen session|Session transcript)/.test(note.title)
      ? "automatic"
      : "manual")
  );
}
export function filterNotes(
  notes: NoteRecord[],
  options: {
    query?: string;
    filter?: NoteFilter;
    folder?: string;
    tag?: string;
    sort?: string;
  },
) {
  const query = (options.query ?? "").toLocaleLowerCase();
  return notes
    .filter((note) => {
      if (options.filter === "archived" ? !note.archived : note.archived)
        return false;
      if (options.filter === "favorites" && !note.favorite) return false;
      if (
        (options.filter === "automatic" || options.filter === "manual") &&
        noteKind(note) !== options.filter
      )
        return false;
      if (options.folder && note.folder !== options.folder) return false;
      if (options.tag && !note.tags?.includes(options.tag)) return false;
      return `${note.title} ${note.content} ${(note.tags ?? []).join(" ")}`
        .toLocaleLowerCase()
        .includes(query);
    })
    .sort((a, b) =>
      options.sort === "Title"
        ? a.title.localeCompare(b.title)
        : options.sort === "Oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
}
export function noteMarkdown(note: NoteRecord) {
  return `# ${note.title || "Untitled note"}\n\n${note.content}\n`;
}
export function questionsInTranscript(
  segments: string[],
): { position: number; question: string }[] {
  const text = segments.join(" ");
  const results: { position: number; question: string }[] = [];
  for (const match of text.matchAll(/[^.!?]+[.!?]?/g)) {
    const raw = match[0];
    const sentence = raw
      .trim()
      .replace(
        /^(?:(?:alright|okay|ok|so|next|please)[,:]?\s+)*(?:(?:question|q)\s+(?:number\s+)?(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)[,:-]?\s*)?/i,
        "",
      )
      .trim();
    if (
      sentence &&
      (sentence.endsWith("?") ||
        /^(?:what|why|how|when|where|who|can you|could you|would you|tell (?:me|us)|describe|explain|walk (?:me|us)|give (?:me|us)|share|do you|did you|have you|are you|is there|parlez|décrivez|expliquez|racontez|pourquoi|comment|pouvez-vous|cuéntame|cuéntenos|explica|por qué|cómo|qué|puedes|erzählen sie|beschreiben sie|warum|wie|was)\b/i.test(
          sentence,
        ))
    ) {
      results.push({
        position: match.index + raw.indexOf(sentence),
        question: sentence.slice(0, 640),
      });
    }
  }
  return results;
}
export function latestQuestion(segments: string[]): string {
  return questionsInTranscript(segments.slice(-4)).at(-1)?.question ?? "";
}
export function downloadText(
  filename: string,
  text: string,
  type = "text/markdown;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
