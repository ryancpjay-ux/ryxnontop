export type QueuedQuestion = { position: number; question: string };
export function questionComplete(question: string) {
  return (
    !/\b(?:to|with|of|a|an|the|and|or|about|is|are|in|for|your|had|have|has|that)[.?!]*\s*$/i.test(question) &&
    (/[.?!]$/.test(question) ||
    (question.length >= 20 &&
      !/\b(?:to|with|of|a|an|the|and|or|about|is|are|in|for|your|had|have|has|that)\s*$/i.test(
        question,
      )))
  );
}
export class AutoQuestionQueue {
  private pending: QueuedQuestion[] = [];
  private handled = new Set<number>();
  get size() {
    return this.pending.length;
  }
  enqueue(item: QueuedQuestion) {
    if (
      item.position < 0 ||
      !questionComplete(item.question) ||
      this.handled.has(item.position)
    )
      return;
    const existing = this.pending.find(
      (entry) => entry.position === item.position,
    );
    if (existing) existing.question = item.question;
    else this.pending.push(item);
  }
  acknowledge(position: number) {
    this.handled.add(position);
    this.pending = this.pending.filter((item) => item.position !== position);
  }
  take() {
    const item = this.pending.sort((a,b)=>a.position-b.position).at(-1);
    for (const pending of this.pending) this.handled.add(pending.position);
    this.pending = [];
    return item;
  }
  clear() {
    this.pending = [];
    this.handled.clear();
  }
}
