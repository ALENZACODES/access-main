/** Device-memory-only accessibility inquiry planner. All service conditions remain UNKNOWN. */
export type InquiryTopic =
  | "entrance" | "interior-route" | "washroom" | "parking" | "transit"
  | "pickup" | "seating" | "communication" | "service" | "backup";
export type InquiryProgress = "to-ask" | "asked" | "reply-noted" | "follow-up";
export type InquiryImportance = "standard" | "important" | "essential";
export type InquiryChannel = "phone" | "email" | "in-person" | "web" | "other";
export type InquiryCondition = "UNKNOWN";
export type InquirySort = "listed" | "topic" | "priority" | "recent";
export type InquiryFilter = "all" | "outstanding" | "reply-noted" | "essential";
export const INQUIRY_MAX_PLACES = 32;
export const INQUIRY_MAX_QUESTIONS = 240;
export const INQUIRY_MAX_EVENTS = 800;
export const INQUIRY_MAX_TEXT = 1200;
export const INQUIRY_MAX_JSON_BYTES = 524288;
export const INQUIRY_MAX_PAGE = 40;
export const INQUIRY_TOPICS: readonly InquiryTopic[] = [
  "entrance", "interior-route", "washroom", "parking", "transit", "pickup",
  "seating", "communication", "service", "backup",
];
export interface InquiryTemplate {
  readonly id: string;
  readonly topic: InquiryTopic;
  readonly prompt: string;
  readonly importance: InquiryImportance;
}
/** Prompt suggestions are questions, not assertions about any venue. */
export const INQUIRY_TEMPLATES: readonly InquiryTemplate[] = [
  { id: "entrance-step-free", topic: "entrance", prompt: "Which entrance can be approached without steps?", importance: "essential" },
  { id: "entrance-door", topic: "entrance", prompt: "Are there door thresholds or heavy doors to plan around?", importance: "important" },
  { id: "entrance-width", topic: "entrance", prompt: "Is the clear doorway width known?", importance: "important" },
  { id: "entrance-temporary", topic: "entrance", prompt: "Are any entrances temporarily closed?", importance: "important" },
  { id: "route-lift", topic: "interior-route", prompt: "Which route avoids stairs between the entrance and destination?", importance: "essential" },
  { id: "route-elevator", topic: "interior-route", prompt: "Is a lift or elevator needed, and what alternate route exists?", importance: "essential" },
  { id: "route-surface", topic: "interior-route", prompt: "Are there narrow turns, steep surfaces, or temporary obstructions?", importance: "important" },
  { id: "route-rest", topic: "interior-route", prompt: "Where are rest areas along the indoor route?", importance: "standard" },
  { id: "washroom-location", topic: "washroom", prompt: "Where is a washroom with step-free access?", importance: "essential" },
  { id: "washroom-door", topic: "washroom", prompt: "What are the entrance and interior clearances?", importance: "important" },
  { id: "washroom-hours", topic: "washroom", prompt: "Does the washroom remain accessible during the planned visit?", importance: "important" },
  { id: "washroom-alternative", topic: "washroom", prompt: "What alternative is available if the planned washroom closes?", importance: "essential" },
  { id: "parking-location", topic: "parking", prompt: "Where is the nearest designated accessible parking area?", importance: "important" },
  { id: "parking-path", topic: "parking", prompt: "Is there a step-free path from parking to the entrance?", importance: "essential" },
  { id: "parking-dropoff", topic: "parking", prompt: "Is there a safe vehicle drop-off area?", importance: "important" },
  { id: "transit-stop", topic: "transit", prompt: "Which nearby transit stops or stations have suitable paths?", importance: "important" },
  { id: "transit-disruption", topic: "transit", prompt: "Where should I check for service changes on the day?", importance: "important" },
  { id: "transit-transfer", topic: "transit", prompt: "Is a transfer required, and what alternate route could work?", importance: "standard" },
  { id: "pickup-spot", topic: "pickup", prompt: "Where can a driver safely meet someone after the visit?", importance: "important" },
  { id: "pickup-contact", topic: "pickup", prompt: "How can a late pickup or changed meeting place be communicated?", importance: "standard" },
  { id: "seating-space", topic: "seating", prompt: "What spaces can accommodate different mobility devices?", importance: "important" },
  { id: "seating-route", topic: "seating", prompt: "Can the seating area be reached without steps?", importance: "important" },
  { id: "seating-companion", topic: "seating", prompt: "Can companions remain together in the selected area?", importance: "standard" },
  { id: "communication-method", topic: "communication", prompt: "What contact method works best for advance questions?", importance: "important" },
  { id: "communication-format", topic: "communication", prompt: "Can important directions be provided in writing?", importance: "standard" },
  { id: "communication-person", topic: "communication", prompt: "Who should be contacted if the planned route changes?", importance: "important" },
  { id: "service-hours", topic: "service", prompt: "What hours apply to the specific service or entrance?", importance: "important" },
  { id: "service-booking", topic: "service", prompt: "Is advance notice requested for the relevant service?", importance: "standard" },
  { id: "service-change", topic: "service", prompt: "Where are same-day service updates published?", importance: "important" },
  { id: "backup-arrival", topic: "backup", prompt: "What alternate entrance could be used if the main route is blocked?", importance: "essential" },
  { id: "backup-contact", topic: "backup", prompt: "Who could clarify a changed condition during the visit?", importance: "important" },
  { id: "backup-return", topic: "backup", prompt: "What are the options if the preferred return route cannot be used?", importance: "important" },
];
export interface InquiryPlace {
  readonly id: string;
  readonly label: string;
  readonly area: string;
  readonly plannedDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface InquiryQuestion {
  readonly id: string;
  readonly placeId: string;
  readonly topic: InquiryTopic;
  readonly prompt: string;
  readonly importance: InquiryImportance;
  readonly progress: InquiryProgress;
  readonly condition: InquiryCondition;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface InquiryEvent {
  readonly id: string;
  readonly questionId: string;
  readonly at: string;
  readonly channel: InquiryChannel;
  readonly note: string;
  readonly sourceDate: string | null;
}
export interface InquiryBook {
  readonly format: "access-inquiry-book-v1";
  readonly places: readonly InquiryPlace[];
  readonly questions: readonly InquiryQuestion[];
  readonly events: readonly InquiryEvent[];
}
export interface InquiryRow {
  readonly question: InquiryQuestion;
  readonly place: InquiryPlace;
  readonly mostRecent: InquiryEvent | null;
  readonly eventCount: number;
  readonly unanswered: boolean;
}
export interface InquiryQuery {
  readonly placeId?: string;
  readonly filter?: InquiryFilter;
  readonly topic?: InquiryTopic | "all";
  readonly sort?: InquirySort;
  readonly search?: string;
  readonly offset?: number;
  readonly limit?: number;
}
export interface InquiryPage {
  readonly rows: readonly InquiryRow[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export interface InquirySummary {
  readonly places: number;
  readonly questions: number;
  readonly toAsk: number;
  readonly asked: number;
  readonly replies: number;
  readonly followUps: number;
  readonly essentialOutstanding: number;
  readonly unknownConditions: number;
  readonly mostRecentAt: string | null;
}
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const PROGRESS: readonly InquiryProgress[] = ["to-ask", "asked", "reply-noted", "follow-up"];
const PRIORITY: readonly InquiryImportance[] = ["standard", "important", "essential"];
const CHANNELS: readonly InquiryChannel[] = ["phone", "email", "in-person", "web", "other"];
const SORTS: readonly InquirySort[] = ["listed", "topic", "priority", "recent"];
const FILTERS: readonly InquiryFilter[] = ["all", "outstanding", "reply-noted", "essential"];
const empty: InquiryBook = { format: "access-inquiry-book-v1", places: [], questions: [], events: [] };
export function emptyInquiryBook(): InquiryBook { return { ...empty }; }
function assertId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new TypeError(`Invalid ${name}`);
}
function assertText(value: unknown, name: string, max = INQUIRY_MAX_TEXT): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
    [...value].some((part) => { const unit = part.charCodeAt(0); return unit < 32 && unit !== 10 && unit !== 9 || unit === 127; })) {
    throw new TypeError(`Invalid ${name}`);
  }
}
function assertDate(value: unknown): asserts value is string | null {
  if (value === null) return;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw new TypeError("Invalid date");
  const result = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new TypeError("Invalid date");
}
function assertTime(value: unknown): asserts value is string {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) throw new TypeError("Invalid time");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(/\.000Z$/u, "Z").slice(0, 19) !== value.slice(0, 19)) {
    throw new TypeError("Invalid time");
  }
}
function validChoice<T extends string>(value: unknown, choices: readonly T[], label: string): asserts value is T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new TypeError(`Invalid ${label}`);
}
function assertCapacity(book: InquiryBook): void {
  if (book.places.length > INQUIRY_MAX_PLACES || book.questions.length > INQUIRY_MAX_QUESTIONS ||
    book.events.length > INQUIRY_MAX_EVENTS) throw new RangeError("Inquiry limit reached");
}
function assertUnique(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new TypeError(`Repeated ${label}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Validate a full imported file, including references, ordering and bounded metadata. */
export function validateInquiryBook(value: unknown): InquiryBook {
  if (!isRecord(value) || value.format !== "access-inquiry-book-v1" ||
    !Array.isArray(value.places) || !Array.isArray(value.questions) || !Array.isArray(value.events)) {
    throw new TypeError("Invalid inquiry format");
  }
  const book: InquiryBook = {
    format: "access-inquiry-book-v1",
    places: value.places as InquiryPlace[],
    questions: value.questions as InquiryQuestion[],
    events: value.events as InquiryEvent[],
  };
  assertCapacity(book);
  for (const place of book.places) {
    if (!isRecord(place)) throw new TypeError("Invalid place");
    assertId(place.id, "place ID");
    assertText(place.label, "place label", 180);
    assertText(place.area, "area", 180);
    assertDate(place.plannedDate);
    assertTime(place.createdAt);
    assertTime(place.updatedAt);
    if (place.updatedAt < place.createdAt) throw new TypeError("Place update precedes creation");
  }
  assertUnique(book.places.map((place) => place.id), "place ID");
  const places = new Set(book.places.map((place) => place.id));
  for (const question of book.questions) {
    if (!isRecord(question)) throw new TypeError("Invalid question");
    assertId(question.id, "question ID");
    if (!places.has(question.placeId)) throw new TypeError("Question refers to absent place");
    validChoice(question.topic, INQUIRY_TOPICS, "topic");
    assertText(question.prompt, "question", 300);
    validChoice(question.importance, PRIORITY, "importance");
    validChoice(question.progress, PROGRESS, "progress");
    if (question.condition !== "UNKNOWN") throw new TypeError("Condition must remain UNKNOWN");
    assertTime(question.createdAt);
    assertTime(question.updatedAt);
    if (question.updatedAt < question.createdAt) throw new TypeError("Question update precedes creation");
    const place = book.places.find((item) => item.id === question.placeId);
    if (place && question.createdAt < place.createdAt) throw new TypeError("Question predates place");
  }
  assertUnique(book.questions.map((question) => question.id), "question ID");
  const questions = new Map(book.questions.map((item) => [item.id, item]));
  for (const event of book.events) {
    if (!isRecord(event)) throw new TypeError("Invalid event");
    assertId(event.id, "event ID");
    const question = questions.get(event.questionId);
    if (!question) throw new TypeError("Event refers to absent question");
    assertTime(event.at);
    if (event.at < question.createdAt) throw new TypeError("Event predates question");
    validChoice(event.channel, CHANNELS, "contact channel");
    assertText(event.note, "event note");
    assertDate(event.sourceDate);
    if (event.sourceDate && event.sourceDate > event.at.slice(0, 10)) throw new TypeError("Future source date");
  }
  assertUnique(book.events.map((event) => event.id), "event ID");
  for (let i = 1; i < book.events.length; i++) {
    const previous = book.events[i - 1];
    const current = book.events[i];
    if (previous && current && previous.at > current.at) throw new TypeError("Events out of order");
  }
  return {
    format: "access-inquiry-book-v1",
    places: book.places.map((place) => ({ ...place })),
    questions: book.questions.map((question) => ({ ...question, condition: "UNKNOWN" })),
    events: book.events.map((event) => ({ ...event })),
  };
}
export function addInquiryPlace(book: InquiryBook, place: InquiryPlace): InquiryBook {
  const next = { ...book, places: [...book.places, place] };
  return validateInquiryBook(next);
}
export function renameInquiryPlace(book: InquiryBook, id: string, label: string, at: string): InquiryBook {
  assertTime(at);
  assertText(label, "place label", 180);
  if (!book.places.some((place) => place.id === id)) throw new TypeError("Unknown place");
  return validateInquiryBook({ ...book, places: book.places.map((place) => place.id === id ?
    { ...place, label, updatedAt: at } : place) });
}
export function rescheduleInquiryPlace(book: InquiryBook, id: string, date: string | null, at: string): InquiryBook {
  assertDate(date);
  assertTime(at);
  if (!book.places.some((place) => place.id === id)) throw new TypeError("Unknown place");
  return validateInquiryBook({ ...book, places: book.places.map((place) => place.id === id ?
    { ...place, plannedDate: date, updatedAt: at } : place) });
}
export function removeInquiryPlace(book: InquiryBook, id: string): InquiryBook {
  if (!book.places.some((place) => place.id === id)) throw new TypeError("Unknown place");
  const questions = book.questions.filter((question) => question.placeId !== id);
  const ids = new Set(questions.map((question) => question.id));
  return validateInquiryBook({ ...book, places: book.places.filter((place) => place.id !== id),
    questions, events: book.events.filter((event) => ids.has(event.questionId)) });
}
export function addInquiryQuestion(book: InquiryBook, question: InquiryQuestion): InquiryBook {
  return validateInquiryBook({ ...book, questions: [...book.questions, question] });
}
export function addTemplateQuestions(book: InquiryBook, placeId: string, ids: readonly string[], at: string): InquiryBook {
  assertTime(at);
  if (!book.places.some((place) => place.id === placeId)) throw new TypeError("Unknown place");
  assertUnique(ids, "template IDs");
  let next = book;
  for (const id of ids) {
    const template = INQUIRY_TEMPLATES.find((item) => item.id === id);
    if (!template) throw new TypeError("Unknown inquiry template");
    const question: InquiryQuestion = {
      id: `${placeId}_${template.id}`.slice(0, 96).replace(/[^a-zA-Z0-9_-]/gu, "-"),
      placeId, topic: template.topic, prompt: template.prompt,
      importance: template.importance, progress: "to-ask", condition: "UNKNOWN",
      createdAt: at, updatedAt: at,
    };
    next = addInquiryQuestion(next, question);
  }
  return next;
}
export function updateInquiryQuestion(
  book: InquiryBook, id: string,
  changes: { readonly progress?: InquiryProgress; readonly importance?: InquiryImportance; readonly prompt?: string },
  at: string,
): InquiryBook {
  assertTime(at);
  if (!book.questions.some((question) => question.id === id)) throw new TypeError("Unknown question");
  const updated = book.questions.map((question) => question.id !== id ? question : ({
    ...question, ...changes, condition: "UNKNOWN" as const, updatedAt: at,
  }));
  return validateInquiryBook({ ...book, questions: updated });
}
export function removeInquiryQuestion(book: InquiryBook, id: string): InquiryBook {
  if (!book.questions.some((question) => question.id === id)) throw new TypeError("Unknown question");
  return validateInquiryBook({ ...book, questions: book.questions.filter((question) => question.id !== id),
    events: book.events.filter((event) => event.questionId !== id) });
}
export function addInquiryEvent(book: InquiryBook, event: InquiryEvent): InquiryBook {
  const ordered = [...book.events, event].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return validateInquiryBook({ ...book, events: ordered });
}
export function replaceInquiryEvent(book: InquiryBook, event: InquiryEvent): InquiryBook {
  if (!book.events.some((item) => item.id === event.id)) throw new TypeError("Unknown event");
  return validateInquiryBook({ ...book, events: book.events.map((item) => item.id === event.id ? event : item)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) });
}
export function removeInquiryEvent(book: InquiryBook, id: string): InquiryBook {
  if (!book.events.some((event) => event.id === id)) throw new TypeError("Unknown event");
  return validateInquiryBook({ ...book, events: book.events.filter((event) => event.id !== id) });
}
export function inquirySummary(book: InquiryBook): InquirySummary {
  return {
    places: book.places.length,
    questions: book.questions.length,
    toAsk: book.questions.filter((question) => question.progress === "to-ask").length,
    asked: book.questions.filter((question) => question.progress === "asked").length,
    replies: book.questions.filter((question) => question.progress === "reply-noted").length,
    followUps: book.questions.filter((question) => question.progress === "follow-up").length,
    essentialOutstanding: book.questions.filter((question) => question.importance === "essential" &&
      question.progress !== "reply-noted").length,
    unknownConditions: book.questions.length,
    mostRecentAt: book.events.length ? book.events[book.events.length - 1]?.at ?? null : null,
  };
}
export function inquiryPage(book: InquiryBook, query: InquiryQuery = {}): InquiryPage {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 12;
  const filter = query.filter ?? "all";
  const sort = query.sort ?? "listed";
  const topic = query.topic ?? "all";
  const search = (query.search ?? "").trim().toLocaleLowerCase();
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 ||
    limit > INQUIRY_MAX_PAGE) throw new RangeError("Invalid inquiry page");
  validChoice(filter, FILTERS, "filter");
  validChoice(sort, SORTS, "sort");
  if (topic !== "all") validChoice(topic, INQUIRY_TOPICS, "topic");
  const places = new Map(book.places.map((place) => [place.id, place]));
  const events = new Map<string, InquiryEvent[]>();
  for (const event of book.events) events.set(event.questionId, [...(events.get(event.questionId) ?? []), event]);
  const rows: InquiryRow[] = [];
  for (const question of book.questions) {
    const place = places.get(question.placeId);
    if (!place) continue;
    if (query.placeId && question.placeId !== query.placeId) continue;
    if (topic !== "all" && topic !== question.topic) continue;
    if (filter === "outstanding" && question.progress === "reply-noted") continue;
    if (filter === "reply-noted" && question.progress !== "reply-noted") continue;
    if (filter === "essential" && question.importance !== "essential") continue;
    const relevant = events.get(question.id) ?? [];
    const recent = relevant[relevant.length - 1] ?? null;
    if (search && ![question.prompt, question.id, question.topic, place.label, place.area, recent?.note ?? ""]
      .some((text) => text.toLocaleLowerCase().includes(search))) continue;
    rows.push({ question, place, mostRecent: recent, eventCount: relevant.length,
      unanswered: question.progress !== "reply-noted" });
  }
  if (sort === "topic") rows.sort((a, b) => a.question.topic.localeCompare(b.question.topic) || a.question.id.localeCompare(b.question.id));
  if (sort === "priority") rows.sort((a, b) => PRIORITY.indexOf(b.question.importance) - PRIORITY.indexOf(a.question.importance) ||
    a.question.id.localeCompare(b.question.id));
  if (sort === "recent") rows.sort((a, b) => b.question.updatedAt.localeCompare(a.question.updatedAt) ||
    a.question.id.localeCompare(b.question.id));
  return { rows: rows.slice(offset, offset + limit), total: rows.length,
    previous: offset > 0, next: offset + limit < rows.length };
}
export function encodeInquiryBook(book: InquiryBook): string {
  const valid = validateInquiryBook(book);
  const json = JSON.stringify(valid, null, 2) + "\n";
  if (new TextEncoder().encode(json).byteLength > INQUIRY_MAX_JSON_BYTES) throw new RangeError("Inquiry export too large");
  return json;
}
export function decodeInquiryBook(text: string): InquiryBook {
  if (new TextEncoder().encode(text).byteLength > INQUIRY_MAX_JSON_BYTES) throw new RangeError("Inquiry import too large");
  const input: unknown = JSON.parse(text);
  return validateInquiryBook(input);
}
export function inquiryQuestionCoverage(book: InquiryBook, placeId: string): Readonly<Record<InquiryTopic, number>> {
  if (!book.places.some((place) => place.id === placeId)) throw new TypeError("Unknown place");
  const count = Object.fromEntries(INQUIRY_TOPICS.map((topic) => [topic, 0])) as Record<InquiryTopic, number>;
  for (const question of book.questions) if (question.placeId === placeId) count[question.topic]++;
  return count;
}
export function inquiryUnansweredByTopic(book: InquiryBook, placeId: string): Readonly<Record<InquiryTopic, number>> {
  if (!book.places.some((place) => place.id === placeId)) throw new TypeError("Unknown place");
  const count = Object.fromEntries(INQUIRY_TOPICS.map((topic) => [topic, 0])) as Record<InquiryTopic, number>;
  for (const question of book.questions) {
    if (question.placeId === placeId && question.progress !== "reply-noted") count[question.topic]++;
  }
  return count;
}
