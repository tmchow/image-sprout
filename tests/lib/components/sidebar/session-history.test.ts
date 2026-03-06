import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

vi.mock('../../../../src/lib/stores/sessions.svelte.ts', () => {
  let _sessions: any[] = [];

  return {
    sessions: new Proxy([] as any[], {
      get(_target, prop) {
        return Reflect.get(_sessions, prop);
      },
      has(_target, prop) {
        return Reflect.has(_sessions, prop);
      },
    }),
    loadSessions: vi.fn(),
    _setSessions(value: any[]) {
      _sessions = value;
    },
    _reset() {
      _sessions = [];
    },
  };
});

vi.mock('../../../../src/lib/stores/projects.svelte.ts', () => {
  let _projectId: string | null = 'project-1';
  let _status: any = { readiness: { generate: true } };

  return {
    activeProjectId: {
      get value() { return _projectId; },
    },
    projectStatus: {
      get value() { return _status; },
    },
    _setProjectId(id: string | null) { _projectId = id; },
    _reset() {
      _projectId = 'project-1';
      _status = { readiness: { generate: true } };
    },
  };
});

vi.mock('../../../../src/lib/stores/generation.svelte.ts', () => {
  let _activeSessionId: string | null = null;

  return {
    generationState: {
      get activeSessionId() { return _activeSessionId; },
    },
    loadSession: vi.fn(),
    deleteSessionFromGeneration: vi.fn(),
    startNewSessionDraft: vi.fn(),
    _setActiveSessionId(id: string | null) { _activeSessionId = id; },
    _reset() { _activeSessionId = null; },
  };
});

import SessionHistory from '../../../../src/lib/components/sidebar/SessionHistory.svelte';

const sessionsMock = await vi.importMock<any>('../../../../src/lib/stores/sessions.svelte.ts');
const generationMock = await vi.importMock<any>('../../../../src/lib/stores/generation.svelte.ts');
const projectsMock = await vi.importMock<any>('../../../../src/lib/stores/projects.svelte.ts');

const SESSIONS = [
  { id: 'session-1', projectId: 'project-1', prompt: 'a cat in space', createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T01:00:00.000Z' },
  { id: 'session-2', projectId: 'project-1', prompt: 'a dog on the moon', createdAt: '2026-03-05T02:00:00.000Z', updatedAt: '2026-03-05T03:00:00.000Z' },
];

describe('SessionHistory', () => {
  beforeEach(() => {
    sessionsMock._reset();
    generationMock._reset();
    projectsMock._reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('empty state', () => {
    it('shows empty message when there are no sessions', () => {
      const { getByTestId } = render(SessionHistory);
      expect(getByTestId('session-history-empty')).toBeTruthy();
    });
  });

  describe('session list', () => {
    it('renders session items', () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);
      expect(getByTestId('session-item-session-1')).toBeTruthy();
      expect(getByTestId('session-item-session-2')).toBeTruthy();
    });

    it('calls loadSession when a session is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);
      await fireEvent.click(getByTestId('session-item-session-1'));
      expect(generationMock.loadSession).toHaveBeenCalledWith('session-1');
    });

    it('calls startNewSessionDraft when New Session is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);
      await fireEvent.click(getByTestId('new-session-button'));
      expect(generationMock.startNewSessionDraft).toHaveBeenCalled();
    });
  });

  describe('delete confirmation', () => {
    it('shows confirmation when delete button is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId, queryByTestId } = render(SessionHistory);

      // Confirmation not visible initially
      expect(queryByTestId('confirm-delete-session-1')).toBeNull();

      // Click the delete button
      await fireEvent.click(getByTestId('delete-session-session-1'));

      // Confirmation appears
      expect(getByTestId('confirm-delete-session-1')).toBeTruthy();
      // Original delete button is replaced
      expect(queryByTestId('delete-session-session-1')).toBeNull();
    });

    it('does not delete the session until confirmation is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);

      await fireEvent.click(getByTestId('delete-session-session-1'));
      expect(generationMock.deleteSessionFromGeneration).not.toHaveBeenCalled();
    });

    it('deletes the session when the confirm button is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);

      await fireEvent.click(getByTestId('delete-session-session-1'));
      await fireEvent.click(getByTestId('confirm-delete-yes-session-1'));

      expect(generationMock.deleteSessionFromGeneration).toHaveBeenCalledWith('session-1');
    });

    it('cancels deletion when the cancel button is clicked', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId, queryByTestId } = render(SessionHistory);

      await fireEvent.click(getByTestId('delete-session-session-1'));
      expect(getByTestId('confirm-delete-session-1')).toBeTruthy();

      await fireEvent.click(getByTestId('confirm-delete-no-session-1'));

      // Confirmation dismissed, original delete button restored
      expect(queryByTestId('confirm-delete-session-1')).toBeNull();
      expect(getByTestId('delete-session-session-1')).toBeTruthy();
      expect(generationMock.deleteSessionFromGeneration).not.toHaveBeenCalled();
    });

    it('auto-dismisses confirmation after timeout', async () => {
      vi.useFakeTimers();
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId, queryByTestId } = render(SessionHistory);

      await fireEvent.click(getByTestId('delete-session-session-1'));
      expect(getByTestId('confirm-delete-session-1')).toBeTruthy();

      vi.advanceTimersByTime(3000);
      await vi.runAllTicks();

      expect(queryByTestId('confirm-delete-session-1')).toBeNull();
      expect(getByTestId('delete-session-session-1')).toBeTruthy();
      expect(generationMock.deleteSessionFromGeneration).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('does not trigger session navigation when clicking delete or confirm', async () => {
      sessionsMock._setSessions(SESSIONS);
      const { getByTestId } = render(SessionHistory);

      await fireEvent.click(getByTestId('delete-session-session-1'));
      expect(generationMock.loadSession).not.toHaveBeenCalled();

      await fireEvent.click(getByTestId('confirm-delete-yes-session-1'));
      expect(generationMock.loadSession).not.toHaveBeenCalled();
    });
  });
});
