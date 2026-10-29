const { test }=require('node:test');
const assert=require('node:assert/strict');
const {filterNotes,noteKind,noteMarkdown,latestQuestion}=require('../lib/local-library.ts');
const notes=[
{id:'a',title:'Listen session · today',content:'API launch decision',date:'2026-10-28',folder:'Interviews',tags:['API']},
{id:'b',title:'Preparation',content:'Review structures',date:'2026-10-27',kind:'manual',favorite:true,tags:['coding']},
{id:'c',title:'Archived work',content:'Old material',date:'2026-10-20',archived:true,favorite:true},
];
test('legacy session notes migrate to Automatic and ordinary notes to Manual',()=>{assert.equal(noteKind(notes[0]),'automatic');assert.equal(noteKind(notes[1]),'manual');});
test('archive, favorites, folder, tags, search, and sorting select the intended notes',()=>{
assert.deepEqual(filterNotes(notes,{filter:'all'}).map(n=>n.id),['a','b']);
assert.deepEqual(filterNotes(notes,{filter:'archived'}).map(n=>n.id),['c']);
assert.deepEqual(filterNotes(notes,{filter:'favorites'}).map(n=>n.id),['b']);
assert.deepEqual(filterNotes(notes,{folder:'Interviews',tag:'API',query:'launch'}).map(n=>n.id),['a']);
assert.deepEqual(filterNotes(notes,{sort:'Oldest'}).map(n=>n.id),['b','a']);
});
test('question detection handles questions split over final transcript segments',()=>{
assert.equal(latestQuestion(['Let us discuss algorithms.','Can you reverse a singly linked list?']),'Can you reverse a singly linked list?');
assert.equal(latestQuestion(['Tell me about','a difficult project.']),'Tell me about a difficult project.');
assert.equal(latestQuestion(['Thanks for joining us today.']),'');
});
test('Markdown export preserves the title and note text',()=>{assert.equal(noteMarkdown(notes[1]),'# Preparation\n\nReview structures\n');});
