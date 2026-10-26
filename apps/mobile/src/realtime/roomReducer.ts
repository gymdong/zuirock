import type {
  FinishedEvent,
  ProgressEvent,
  RoomSnapshotDto,
  ServerToClientEvents,
} from '@zuirock/shared';

/** Client view of a live room, built from snapshots and versioned events. */
export interface RoomView {
  snapshot: RoomSnapshotDto | null;
  progress: ProgressEvent | null;
  /** Personal result (`room:finished` is sent per socket). */
  finished: FinishedEvent | null;
  dissolved: boolean;
}

export const EMPTY_ROOM: RoomView = { snapshot: null, progress: null, finished: null, dissolved: false };

type EventName = Exclude<keyof ServerToClientEvents, 'room:error' | 'room:chat' | 'room:sticker'>;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/** A full snapshot (join/resume ack) always wins; it resets progress for a new question. */
export function applySnapshot(view: RoomView, snapshot: RoomSnapshotDto): RoomView {
  const sameQuestion = view.snapshot?.question?.index === snapshot.question?.index;
  return {
    ...view,
    snapshot,
    progress: sameQuestion ? view.progress : null,
    finished: snapshot.phase === 'finished' ? view.finished : null,
    dissolved: snapshot.phase === 'dissolved',
  };
}

/**
 * Apply a server event. CAS fence: events older than the applied version are dropped (the server
 * answers `room:resume` with a full snapshot to fill any gap).
 */
export function applyRoomEvent<E extends EventName>(view: RoomView, name: E, payload: Payload<E>): RoomView {
  const snap = view.snapshot;
  if (snap && payload.version < snap.version) return view;
  if (name === 'room:state') return applySnapshot(view, payload as RoomSnapshotDto);
  if (!snap) return view;
  const base = { ...snap, version: payload.version, serverNow: payload.serverNow };

  switch (name) {
    case 'room:participants': {
      const e = payload as Payload<'room:participants'>;
      return { ...view, snapshot: { ...base, participants: e.participants, hostParticipantId: e.hostParticipantId } };
    }
    case 'room:settings':
      return { ...view, snapshot: { ...base, settings: (payload as Payload<'room:settings'>).settings } };
    case 'room:question': {
      const { question } = payload as Payload<'room:question'>;
      return {
        ...view,
        progress: null,
        finished: null,
        snapshot: {
          ...base,
          phase: 'question',
          question,
          reveal: null,
          results: null,
          you: { ...snap.you, question: { submitted: false, solved: false, gaveUp: false, attempts: 0 } },
        },
      };
    }
    case 'room:chosungReveal': {
      const e = payload as Payload<'room:chosungReveal'>;
      if (!snap.question || snap.question.index !== e.questionIndex) return { ...view, snapshot: base };
      return { ...view, snapshot: { ...base, question: { ...snap.question, chosung: e.chosung } } };
    }
    case 'room:progress':
      return { ...view, snapshot: base, progress: payload as ProgressEvent };
    case 'room:reveal':
      return { ...view, snapshot: { ...base, phase: 'reveal', reveal: (payload as Payload<'room:reveal'>).reveal } };
    case 'room:finished': {
      const e = payload as FinishedEvent;
      return { ...view, finished: e, snapshot: { ...base, phase: 'finished', results: e.results, sessionId: e.sessionId } };
    }
    case 'room:dissolved':
      return { ...view, dissolved: true, snapshot: { ...base, phase: 'dissolved' } };
    default:
      return view;
  }
}
